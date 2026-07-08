import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook, PRICE_TO_TIER } from "@/lib/stripe.server";

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

function tierFromSubscription(sub: any): "foundation" | "studio" | "practice" | null {
  const item = sub?.items?.data?.[0];
  const lookup = item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || null;
  if (lookup && PRICE_TO_TIER[lookup]) return PRICE_TO_TIER[lookup];
  const metaTier = sub?.metadata?.tier;
  if (metaTier === "foundation" || metaTier === "studio" || metaTier === "practice") return metaTier;
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
  const patch: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: SubStatus;
    subscription_tier?: "foundation" | "studio" | "practice";
    trial_ends_at?: string;
  } = {
    stripe_customer_id: sub.customer ?? null,
    stripe_subscription_id: sub.id ?? null,
    subscription_status: status,
  };
  if (tier) patch.subscription_tier = tier;
  if (periodEnd) patch.trial_ends_at = new Date(periodEnd * 1000).toISOString();
  const { error } = await admin.from("firms").update(patch).eq("id", firmId);
  if (error) console.error("[stripe-webhook] firm update failed", error);
}

async function markCanceled(sub: any) {
  const admin = await getAdmin();
  const firmId = await firmIdForSubscription(sub);
  if (!firmId) return;
  const { error } = await admin
    .from("firms")
    .update({ subscription_status: "canceled" })
    .eq("id", firmId);
  if (error) console.error("[stripe-webhook] cancel failed", error);
}

async function markPastDue(invoice: any) {
  const subId = invoice?.subscription;
  if (!subId) return;
  const admin = await getAdmin();
  const { error } = await admin
    .from("firms")
    .update({ subscription_status: "past_due" })
    .eq("stripe_subscription_id", subId);
  if (error) console.error("[stripe-webhook] past_due failed", error);
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
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