import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook, PRICE_TO_TIER, FOUNDING_PRICE_KEYS } from "@/lib/stripe.server";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type SubStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

function normalizeStatus(s: string): SubStatus {
  if (s === "trialing" || s === "active" || s === "past_due" || s === "canceled" || s === "incomplete") return s;
  if (s === "unpaid") return "past_due";
  if (s === "incomplete_expired") return "canceled";
  return "incomplete";
}

function tierFromSubscription(_sub: any): "studio" | "practice" | null {
  // Single-plan model: every subscription grants "practice" access. Tier is
  // no longer sourced from lookup keys or metadata.
  void PRICE_TO_TIER;
  return "practice";
}

function priceLookupFromSubscription(sub: any): string | null {
  const item = sub?.items?.data?.[0];
  return (
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    null
  );
}

function billingFrequencyFromSubscription(sub: any): "monthly" | "annual" | null {
  const item = sub?.items?.data?.[0];
  const interval = item?.price?.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "annual";
  return null;
}

async function firmIdForSubscription(sub: any): Promise<string | null> {
  if (sub?.metadata?.firmId) return sub.metadata.firmId;
  const admin = await getAdmin();
  if (sub?.customer) {
    const { data } = await admin
      .from("firms")
      .select("id")
      .eq("stripe_customer_id", sub.customer)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function upsertFromSubscription(sub: any) {
  const admin = await getAdmin();
  const firmId = await firmIdForSubscription(sub);
  if (!firmId) {
    console.error("[stripe-webhook] cannot resolve firmId for subscription", sub?.id);
    return;
  }
  const tier = tierFromSubscription(sub);
  const status = normalizeStatus(sub.status);
  const item = sub?.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? sub?.current_period_end;
  const trialEnd = sub?.trial_end ?? null;
  const lookup = priceLookupFromSubscription(sub);
  const freq = billingFrequencyFromSubscription(sub);
  const patch: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: SubStatus;
    subscription_tier?: "studio" | "practice";
    trial_ends_at?: string | null;
    current_period_end?: string | null;
    past_due_since?: string | null;
    stripe_price_id?: string | null;
    billing_frequency?: "monthly" | "annual";
  } = {
    stripe_customer_id: sub.customer ?? null,
    stripe_subscription_id: sub.id ?? null,
    subscription_status: status,
  };
  if (tier) patch.subscription_tier = tier;
  if (lookup) patch.stripe_price_id = lookup;
  if (freq) patch.billing_frequency = freq;
  // trial_ends_at reflects an ACTUAL trial from Stripe; clear it otherwise.
  patch.trial_ends_at = trialEnd ? new Date(trialEnd * 1000).toISOString() : null;
  if (periodEnd) patch.current_period_end = new Date(periodEnd * 1000).toISOString();
  // Track when past_due started so the app can flip to read-only after 7 days.
  if (status === "past_due") {
    const { data: existing } = await admin
      .from("firms")
      .select("past_due_since, subscription_status")
      .eq("id", firmId)
      .maybeSingle();
    if (!existing?.past_due_since || existing.subscription_status !== "past_due") {
      patch.past_due_since = new Date().toISOString();
    }
  } else {
    patch.past_due_since = null;
  }
  const { error } = await admin.from("firms").update(patch as any).eq("id", firmId);
  if (error) console.error("[stripe-webhook] firm update failed", error);

  // If this subscription is on a founding price and this firm hasn't been
  // recorded yet, insert into the founding_access counter (idempotent by PK).
  if (lookup && FOUNDING_PRICE_KEYS.has(lookup)) {
    const { error: faErr } = await admin
      .from("founding_access" as any)
      .upsert({ firm_id: firmId, stripe_price_id: lookup }, { onConflict: "firm_id" });
    if (faErr) console.error("[stripe-webhook] founding_access upsert failed", faErr);
  }
}

async function markCanceled(sub: any) {
  const admin = await getAdmin();
  const firmId = await firmIdForSubscription(sub);
  if (!firmId) return;
  // Keep current_period_end so the user retains grace access until it lapses.
  const item = sub?.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? sub?.current_period_end;
  const { error } = await admin
    .from("firms")
    .update({
      subscription_status: "canceled",
      past_due_since: null,
      ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString() } : {}),
    } as any)
    .eq("id", firmId);
  if (error) console.error("[stripe-webhook] cancel failed", error);
}

async function markPastDue(invoice: any) {
  const subId = invoice?.subscription;
  if (!subId) return;
  const admin = await getAdmin();
  // Only set past_due_since if not already set (first failure timestamp).
  const { data: existing } = await admin
    .from("firms")
    .select("id, past_due_since")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!existing) return;
  const { error } = await admin
    .from("firms")
    .update({
      subscription_status: "past_due",
      past_due_since: existing.past_due_since ?? new Date().toISOString(),
    } as any)
    .eq("id", existing.id);
  if (error) console.error("[stripe-webhook] past_due failed", error);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[stripe-webhook] invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;

        let event: { id: string; type: string; data: { object: any } };
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("[stripe-webhook] verify failed", e);
          return new Response("Invalid signature", { status: 400 });
        }

        // Idempotency
        try {
          const admin = await getAdmin();
          const { error: dupErr } = await admin
            .from("stripe_webhook_events")
            .insert({ event_id: event.id, type: event.type });
          if (dupErr && dupErr.code === "23505") {
            return Response.json({ received: true, duplicate: true });
          }
        } catch (e) {
          console.error("[stripe-webhook] dedup insert failed", e);
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object;
              if (session.mode === "subscription" && session.subscription) {
                const { createStripeClient } = await import("@/lib/stripe.server");
                const stripe = createStripeClient(env);
                const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
                  expand: ["items.data.price"],
                });
                // Ensure firmId metadata is present so future events resolve.
                if (!sub.metadata?.firmId && session.metadata?.firmId) {
                  await stripe.subscriptions.update(sub.id, {
                    metadata: { ...sub.metadata, firmId: session.metadata.firmId, userId: session.metadata.userId ?? "", tier: session.metadata.tier ?? "" },
                  });
                  (sub as any).metadata = { ...sub.metadata, firmId: session.metadata.firmId, tier: session.metadata.tier };
                }
                await upsertFromSubscription(sub);
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await upsertFromSubscription(event.data.object);
              break;
            case "customer.subscription.deleted":
              await markCanceled(event.data.object);
              break;
            case "invoice.payment_failed":
              await markPastDue(event.data.object);
              break;
            default:
              console.log("[stripe-webhook] unhandled:", event.type);
          }
        } catch (e) {
          console.error("[stripe-webhook] handler error", e);
          return new Response("Handler error", { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});