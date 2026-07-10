import { createFileRoute } from "@tanstack/react-router";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
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
        const env = rawEnv;
        const { verifyWebhook } = await import("@/lib/stripe.server");
        const {
          markFirmBillingCanceled,
          markFirmBillingPastDue,
          resolveFirmIdForBillingSync,
          syncFirmBillingFromSubscription,
        } = await import("@/lib/stripe-billing-sync.server");

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
                const admin = await getAdmin();
                const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
                  expand: ["items.data.price"],
                });
                let customer: any = null;
                const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
                if (customerId) {
                  const retrieved = await stripe.customers.retrieve(customerId);
                  if (!(retrieved as any).deleted) customer = retrieved;
                }
                // Ensure firmId metadata is present so future events resolve.
                const firmId = await resolveFirmIdForBillingSync(admin, { subscription: sub, session, customer });
                if (firmId && sub.metadata?.firmId !== firmId) {
                  await stripe.subscriptions.update(sub.id, {
                    metadata: { ...sub.metadata, firmId, userId: session.metadata?.userId ?? "", tier: session.metadata?.tier ?? "", priceKey: session.metadata?.priceKey ?? "" },
                  });
                  (sub as any).metadata = { ...sub.metadata, firmId };
                }
                await syncFirmBillingFromSubscription(admin, sub, { session, customer, fallbackFirmId: firmId, logPrefix: "[stripe-webhook]" });
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated": {
              const { createStripeClient } = await import("@/lib/stripe.server");
              const stripe = createStripeClient(env);
              const sub = event.data.object;
              let customer: any = null;
              const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
              if (customerId) {
                const retrieved = await stripe.customers.retrieve(customerId);
                if (!(retrieved as any).deleted) customer = retrieved;
              }
              await syncFirmBillingFromSubscription(await getAdmin(), sub, { customer, logPrefix: "[stripe-webhook]" });
              break;
            }
            case "customer.subscription.deleted":
              await markFirmBillingCanceled(await getAdmin(), event.data.object);
              break;
            case "invoice.payment_failed":
              await markFirmBillingPastDue(await getAdmin(), event.data.object);
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