import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
  TIER_TO_PRICE,
} from "@/lib/stripe.server";

const envSchema = z.enum(["sandbox", "live"]);
const tierSchema = z.enum(["foundation", "studio", "practice"]);

type CheckoutResult = { clientSecret: string } | { error: string };
type PortalResult = { url: string } | { error: string };

async function resolveOrCreateCustomerForFirm(
  stripe: ReturnType<typeof createStripeClient>,
  opts: { firmId: string; email?: string; firmName?: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(opts.firmId)) throw new Error("Invalid firmId");
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

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tier: tierSchema,
        returnUrl: z.string().url(),
        environment: envSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId } = context;

      const { data: profile } = await supabase
        .from("profiles")
        .select("firm_id, email")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.firm_id) return { error: "No firm associated with user" };

      const { data: firm } = await supabase
        .from("firms")
        .select("id, name, stripe_customer_id, trial_ends_at, subscription_status")
        .eq("id", profile.firm_id)
        .maybeSingle();
      if (!firm) return { error: "Firm not found" };

      const stripe = createStripeClient(data.environment);
      const priceLookup = TIER_TO_PRICE[data.tier];
      const prices = await stripe.prices.list({ lookup_keys: [priceLookup] });
      if (!prices.data.length) return { error: `Price not found for tier ${data.tier}` };
      const price = prices.data[0];

      let customerId = firm.stripe_customer_id ?? undefined;
      if (!customerId) {
        customerId = await resolveOrCreateCustomerForFirm(stripe, {
          firmId: firm.id,
          email: profile.email ?? undefined,
          firmName: firm.name,
        });
      }

      // Honour remaining trial time on new subscriptions.
      const trialEnd = firm.trial_ends_at ? Math.floor(new Date(firm.trial_ends_at).getTime() / 1000) : 0;
      const now = Math.floor(Date.now() / 1000);
      const trialParam =
        firm.subscription_status === "trialing" && trialEnd > now + 60
          ? { trial_end: trialEnd }
          : {};

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        customer_update: { name: "auto", address: "auto" },
        metadata: { firmId: firm.id, userId, tier: data.tier },
        subscription_data: {
          metadata: { firmId: firm.id, userId, tier: data.tier },
          ...trialParam,
        },
        ...({ managed_payments: { enabled: true } } as any),
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      console.error("[createCheckoutSession]", error);
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ returnUrl: z.string().url(), environment: envSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PortalResult> => {
    try {
      const { supabase, userId } = context;
      const { data: profile } = await supabase
        .from("profiles")
        .select("firm_id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.firm_id) return { error: "No firm associated with user" };

      const { data: firm } = await supabase
        .from("firms")
        .select("stripe_customer_id")
        .eq("id", profile.firm_id)
        .maybeSingle();
      if (!firm?.stripe_customer_id) return { error: "No billing account yet — subscribe first" };

      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: firm.stripe_customer_id,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      console.error("[createBillingPortalSession]", error);
      return { error: getStripeErrorMessage(error) };
    }
  });

export const getBillingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.firm_id) return null;
    const { data: firm } = await supabase
      .from("firms")
      .select("id, name, subscription_tier, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id")
      .eq("id", profile.firm_id)
      .maybeSingle();
    return firm ?? null;
  });