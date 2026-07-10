import type Stripe from "stripe";
import { FOUNDING_PRICE_KEYS, type createStripeClient } from "@/lib/stripe.server";

export type SubStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";
export type BillingFrequency = "monthly" | "annual";

type SupabaseAdmin = {
  from: (table: string) => any;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanFirmId(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

export function normalizeSubscriptionStatus(status: string): SubStatus {
  if (status === "trialing" || status === "active" || status === "past_due" || status === "canceled" || status === "incomplete") {
    return status;
  }
  if (status === "unpaid") return "past_due";
  if (status === "incomplete_expired") return "canceled";
  return "incomplete";
}

export function priceLookupFromSubscription(sub: any): string | null {
  const item = sub?.items?.data?.[0];
  return item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || null;
}

export function billingFrequencyFromSubscription(sub: any): BillingFrequency | null {
  const interval = sub?.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "annual";
  return null;
}

async function firmExists(admin: SupabaseAdmin, firmId: string): Promise<boolean> {
  const { data } = await admin.from("firms").select("id").eq("id", firmId).maybeSingle();
  return !!data?.id;
}

async function findFirmByCustomer(admin: SupabaseAdmin, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin
    .from("firms")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function findFirmByEmail(admin: SupabaseAdmin, email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await admin
    .from("profiles")
    .select("firm_id")
    .eq("email", email)
    .not("firm_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.firm_id ?? null;
}

export async function resolveFirmIdForBillingSync(
  admin: SupabaseAdmin,
  options: {
    subscription?: any;
    session?: any;
    customer?: any;
    fallbackFirmId?: string | null;
    fallbackEmail?: string | null;
  },
): Promise<string | null> {
  const candidates = [
    options.fallbackFirmId,
    options.subscription?.metadata?.firmId,
    options.session?.metadata?.firmId,
    options.session?.client_reference_id,
    options.customer?.metadata?.firmId,
  ];

  for (const candidate of candidates) {
    const firmId = cleanFirmId(candidate);
    if (firmId && await firmExists(admin, firmId)) return firmId;
  }

  const customerId =
    stripeId(options.subscription?.customer) ||
    stripeId(options.session?.customer) ||
    stripeId(options.customer);
  const byCustomer = await findFirmByCustomer(admin, customerId);
  if (byCustomer) return byCustomer;

  const email =
    options.fallbackEmail ||
    options.customer?.email ||
    options.session?.customer_details?.email ||
    options.session?.customer_email ||
    null;
  return findFirmByEmail(admin, email);
}

export async function syncFirmBillingFromSubscription(
  admin: SupabaseAdmin,
  sub: any,
  options: {
    session?: any;
    customer?: any;
    fallbackFirmId?: string | null;
    fallbackEmail?: string | null;
    logPrefix?: string;
  } = {},
): Promise<{ ok: true; firmId: string; subscriptionId: string; customerId: string | null; status: SubStatus; priceLookup: string | null } | { ok: false; reason: "firm_not_found" }> {
  const firmId = await resolveFirmIdForBillingSync(admin, { subscription: sub, ...options });
  const customerId = stripeId(sub?.customer) || stripeId(options.session?.customer) || stripeId(options.customer);

  if (!firmId) {
    console.error(`${options.logPrefix ?? "[stripe-billing-sync]"} cannot resolve firm`, {
      subscriptionId: sub?.id,
      customerId,
      sessionId: options.session?.id,
      sessionEmail: options.session?.customer_details?.email ?? options.session?.customer_email ?? null,
    });
    return { ok: false, reason: "firm_not_found" };
  }

  const status = normalizeSubscriptionStatus(sub.status);
  const periodEnd = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
  const trialEnd = sub?.trial_end ?? null;
  const lookup = priceLookupFromSubscription(sub);
  const freq = billingFrequencyFromSubscription(sub);

  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id ?? null,
    subscription_status: status,
    subscription_tier: "practice",
    trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
  };
  if (lookup) patch.stripe_price_id = lookup;
  if (freq) patch.billing_frequency = freq;
  if (periodEnd) patch.current_period_end = new Date(periodEnd * 1000).toISOString();

  if (status === "past_due") {
    const { data: existing } = await admin
      .from("firms")
      .select("past_due_since, subscription_status")
      .eq("id", firmId)
      .maybeSingle();
    patch.past_due_since = existing?.past_due_since && existing.subscription_status === "past_due"
      ? existing.past_due_since
      : new Date().toISOString();
  } else {
    patch.past_due_since = null;
  }

  const { error } = await admin.from("firms").update(patch as any).eq("id", firmId);
  if (error) throw error;

  if (lookup && FOUNDING_PRICE_KEYS.has(lookup)) {
    const { error: foundingError } = await admin
      .from("founding_access")
      .upsert({ firm_id: firmId, stripe_price_id: lookup }, { onConflict: "firm_id" });
    if (foundingError) console.error(`${options.logPrefix ?? "[stripe-billing-sync]"} founding_access upsert failed`, foundingError);
  }

  return { ok: true, firmId, subscriptionId: sub.id, customerId, status, priceLookup: lookup };
}

export async function markFirmBillingCanceled(admin: SupabaseAdmin, sub: any, customer?: any) {
  const firmId = await resolveFirmIdForBillingSync(admin, { subscription: sub, customer });
  if (!firmId) return { ok: false as const, reason: "firm_not_found" as const };
  const periodEnd = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
  const { error } = await admin
    .from("firms")
    .update({
      subscription_status: "canceled",
      past_due_since: null,
      ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString() } : {}),
    } as any)
    .eq("id", firmId);
  if (error) throw error;
  return { ok: true as const, firmId };
}

export async function markFirmBillingPastDue(admin: SupabaseAdmin, invoice: any) {
  const subId = stripeId(invoice?.subscription);
  if (!subId) return { ok: false as const, reason: "no_subscription" as const };
  const { data: existing } = await admin
    .from("firms")
    .select("id, past_due_since")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!existing) return { ok: false as const, reason: "firm_not_found" as const };
  const { error } = await admin
    .from("firms")
    .update({
      subscription_status: "past_due",
      past_due_since: existing.past_due_since ?? new Date().toISOString(),
    } as any)
    .eq("id", existing.id);
  if (error) throw error;
  return { ok: true as const, firmId: existing.id };
}

export async function resolveOrCreateCustomerForFirm(
  stripe: ReturnType<typeof createStripeClient>,
  opts: { firmId: string; email?: string; firmName?: string },
): Promise<string> {
  if (!UUID_RE.test(opts.firmId)) throw new Error("Invalid firmId");
  const found = await stripe.customers.search({
    query: `metadata['firmId']:'${opts.firmId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;

  if (opts.email) {
    const existing = await stripe.customers.list({ email: opts.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (customer.metadata?.firmId !== opts.firmId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, firmId: opts.firmId },
        });
      }
      return customer.id;
    }
  }

  const created = await stripe.customers.create({
    ...(opts.email && { email: opts.email }),
    ...(opts.firmName && { name: opts.firmName }),
    metadata: { firmId: opts.firmId },
  });
  return created.id;
}

export async function backfillFirmBillingFromStripeServer(
  admin: SupabaseAdmin,
  stripe: ReturnType<typeof createStripeClient>,
  firmId: string,
): Promise<
  | { ok: true; customerId: string | null; subscriptionId: string; status: SubStatus; priceLookup: string | null }
  | { ok: false; reason: "firm_not_found" | "no_customer" | "no_subscription"; customerId?: string | null }
> {
  const { data: firm } = await admin
    .from("firms")
    .select("id, owner_id, stripe_customer_id")
    .eq("id", firmId)
    .maybeSingle();
  if (!firm) return { ok: false, reason: "firm_not_found" };

  let ownerEmail: string | null = null;
  if (firm.owner_id) {
    const { data: owner } = await admin
      .from("profiles")
      .select("email")
      .eq("id", firm.owner_id)
      .maybeSingle();
    ownerEmail = owner?.email ?? null;
  }

  let customer: Stripe.Customer | null = null;
  if (firm.stripe_customer_id) {
    const retrieved = await stripe.customers.retrieve(firm.stripe_customer_id);
    if (!retrieved.deleted) customer = retrieved;
  }
  if (!customer) {
    const found = await stripe.customers.search({ query: `metadata['firmId']:'${firm.id}'`, limit: 1 });
    if (found.data.length) customer = found.data[0];
  }
  if (!customer && ownerEmail) {
    const byEmail = await stripe.customers.list({ email: ownerEmail, limit: 10 });
    customer = byEmail.data[0] ?? null;
  }
  if (!customer) return { ok: false, reason: "no_customer" };

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price"],
  });
  const rank = (s: string) =>
    s === "active" ? 0 : s === "trialing" ? 1 : s === "past_due" ? 2 : s === "incomplete" ? 3 : 4;
  const sub = subs.data.slice().sort((a, b) => rank(a.status) - rank(b.status))[0];
  if (!sub) return { ok: false, reason: "no_subscription", customerId: customer.id };

  if (customer.metadata?.firmId !== firm.id) {
    await stripe.customers.update(customer.id, { metadata: { ...customer.metadata, firmId: firm.id } });
  }
  if (sub.metadata?.firmId !== firm.id) {
    await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, firmId: firm.id } });
    (sub as any).metadata = { ...sub.metadata, firmId: firm.id };
  }

  const result = await syncFirmBillingFromSubscription(admin, sub, {
    customer,
    fallbackFirmId: firm.id,
    fallbackEmail: ownerEmail,
    logPrefix: "[backfillFirmBillingFromStripe]",
  });
  if (!result.ok) return { ok: false, reason: result.reason, customerId: customer.id };
  return {
    ok: true,
    customerId: result.customerId,
    subscriptionId: result.subscriptionId,
    status: result.status,
    priceLookup: result.priceLookup,
  };
}