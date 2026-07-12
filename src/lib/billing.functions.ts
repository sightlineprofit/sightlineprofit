import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
  CHECKOUT_PRICE_KEYS,
  PRICE_TO_TIER,
} from "@/lib/stripe.server";
import { resolveOrCreateCustomerForFirm, resolvePriceKey, updateFirmBillingFromBackend } from "@/lib/stripe-billing-sync.server";

const envSchema = z.enum(["sandbox", "live"]);
const priceKeySchema = z.enum(CHECKOUT_PRICE_KEYS);

type CheckoutResult = { clientSecret: string } | { error: string };
type PortalResult = { url: string } | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        priceKey: priceKeySchema,
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
      const priceLookup = data.priceKey;
      const tier = PRICE_TO_TIER[priceLookup];
      const prices = await stripe.prices.list({ lookup_keys: [priceLookup] });
      if (!prices.data.length) return { error: `Price not found: ${priceLookup}` };
      const price = prices.data[0];

      let customerId = firm.stripe_customer_id ?? undefined;
      if (customerId) {
        try {
          const existingCustomer: any = await stripe.customers.retrieve(customerId);
          if (existingCustomer?.deleted) customerId = undefined;
        } catch (e) {
          console.warn(
            "[createCheckoutSession] cached customer id is not available in this Stripe environment; creating one for current mode",
            (e as Error).message,
          );
          customerId = undefined;
        }
      }
      if (!customerId) {
        customerId = await resolveOrCreateCustomerForFirm(stripe, {
          firmId: firm.id,
          email: profile.email ?? undefined,
          firmName: firm.name,
        });
        // Persist immediately so we don't re-search Stripe on every retry
        // while the webhook is still in flight.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await updateFirmBillingFromBackend(supabaseAdmin, firm.id, { stripe_customer_id: customerId });
        } catch (e) {
          console.warn("[createCheckoutSession] failed to cache customer id", e);
        }
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
        client_reference_id: firm.id,
        customer: customerId,
        metadata: { firmId: firm.id, userId, tier, priceKey: priceLookup },
        subscription_data: {
          metadata: { firmId: firm.id, userId, tier, priceKey: priceLookup },
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
      .select("id, name, subscription_tier, subscription_status, trial_ends_at, current_period_end, past_due_since, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_payment_method_id, billing_frequency")
      .eq("id", profile.firm_id)
      .maybeSingle();
    if (!firm) return null;
    // Best-effort: attach card summary + upcoming invoice amount from Stripe.
    let card: { brand: string; last4: string; exp_month: number; exp_year: number } | null = null;
    let nextChargeAmountCents: number | null = null;
    try {
      const env: StripeEnv = process.env.STRIPE_LIVE_API_KEY ? "live" : "sandbox";
      const stripe = createStripeClient(env);
      if (firm.stripe_payment_method_id) {
        const pm = await stripe.paymentMethods.retrieve(firm.stripe_payment_method_id);
        if (pm.card) {
          card = { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year };
        }
      }
      if (firm.stripe_subscription_id) {
        const sub = await stripe.subscriptions.retrieve(firm.stripe_subscription_id);
        const item = sub.items?.data?.[0];
        nextChargeAmountCents = (item?.price?.unit_amount ?? null) as number | null;
      }
    } catch (e) {
      console.warn("[getBillingSummary] stripe enrichment failed", (e as Error).message);
    }
    return { ...firm, card, nextChargeAmountCents };
  });

export const activateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        frequency: z.enum(["monthly", "annual"]),
        paymentMethodId: z.string().trim().min(1).max(120).optional(),
        environment: envSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
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
        .select("id, stripe_customer_id, stripe_payment_method_id, stripe_price_id, stripe_subscription_id, trial_ends_at")
        .eq("id", profile.firm_id)
        .maybeSingle();
      if (!firm) return { error: "Firm not found" };
      if (!firm.stripe_customer_id) return { error: "No billing account on file" };
      if (firm.stripe_subscription_id) return { error: "Subscription already active" };

      const paymentMethodId = data.paymentMethodId ?? firm.stripe_payment_method_id;
      if (!paymentMethodId) return { error: "No payment method on file" };

      const stripe = createStripeClient(data.environment);
      const priceKey = resolvePriceKey(data.frequency, firm.stripe_price_id);
      const prices = await stripe.prices.list({ lookup_keys: [priceKey] });
      if (!prices.data.length) return { error: `Price not found: ${priceKey}` };
      const price = prices.data[0];

      // Attach the payment method if it isn't already, and set it as default.
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: firm.stripe_customer_id });
      } catch (e: any) {
        // Ignore "already attached" errors; rethrow otherwise.
        if (!/already been attached/i.test(String(e?.raw?.message ?? e?.message ?? ""))) throw e;
      }
      await stripe.customers.update(firm.stripe_customer_id, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // Honour remaining trial time (if the user is still trialing).
      const trialEnd = firm.trial_ends_at ? Math.floor(new Date(firm.trial_ends_at).getTime() / 1000) : 0;
      const now = Math.floor(Date.now() / 1000);
      const trialParam = trialEnd > now + 60 ? { trial_end: trialEnd } : {};

      const sub = await stripe.subscriptions.create({
        customer: firm.stripe_customer_id,
        items: [{ price: price.id }],
        default_payment_method: paymentMethodId,
        metadata: { firmId: firm.id, userId, priceKey },
        ...trialParam,
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await updateFirmBillingFromBackend(supabaseAdmin, firm.id, {
          subscription_status: sub.status,
          billing_frequency: data.frequency,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceKey,
          stripe_payment_method_id: paymentMethodId,
        });

      return { ok: true };
    } catch (error) {
      console.error("[activateSubscription]", error);
      return { error: getStripeErrorMessage(error) };
    }
  });

export const switchBillingFrequency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ target: z.enum(["monthly", "annual"]), environment: envSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; scheduledFor?: string } | { error: string }> => {
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
        .select("id, stripe_subscription_id, stripe_price_id, billing_frequency")
        .eq("id", profile.firm_id)
        .maybeSingle();
      if (!firm?.stripe_subscription_id) return { error: "No active subscription" };

      const stripe = createStripeClient(data.environment);
      const newPriceKey = resolvePriceKey(data.target, firm.stripe_price_id);
      const prices = await stripe.prices.list({ lookup_keys: [newPriceKey] });
      if (!prices.data.length) return { error: `Price not found: ${newPriceKey}` };
      const price = prices.data[0];

      const sub = await stripe.subscriptions.retrieve(firm.stripe_subscription_id);
      const item = sub.items?.data?.[0];
      if (!item) return { error: "Subscription has no items" };

      // Monthly → annual: immediate proration. Annual → monthly: schedule at period end.
      const currentIsAnnual = firm.billing_frequency === "annual";
      const goingToMonthly = data.target === "monthly";

      if (currentIsAnnual && goingToMonthly) {
        // Schedule the change at the end of the current period.
        const schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
        const phase = schedule.phases[0] as any;
        await stripe.subscriptionSchedules.update(schedule.id, {
          phases: [
            {
              items: phase.items,
              start_date: phase.start_date,
              end_date: phase.end_date,
            },
            {
              items: [{ price: price.id, quantity: 1 }],
              iterations: 1,
            },
          ] as any,
        });
        const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end ?? null;
        return {
          ok: true,
          scheduledFor: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
        };
      }

      // Immediate switch with proration (monthly → annual, or same-direction refresh).
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: price.id }],
        proration_behavior: "create_prorations",
        metadata: { ...sub.metadata, priceKey: newPriceKey },
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await updateFirmBillingFromBackend(supabaseAdmin, firm.id, {
        billing_frequency: data.target,
        stripe_price_id: newPriceKey,
      });

      return { ok: true };
    } catch (error) {
      console.error("[switchBillingFrequency]", error);
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Fallback used by /post-auth when the Stripe webhook is slow or fails.
 * Retrieves the checkout session server-side, then syncs the firm's billing
 * columns from the resulting subscription. Idempotent — safe to call after
 * the webhook has already landed.
 */
export const syncFirmFromStripeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ session_id: z.string().trim().min(1).max(200), environment: envSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    try {
      const { supabase, userId } = context;
      const { data: profile } = await supabase
        .from("profiles")
        .select("firm_id, email")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.firm_id) return { error: "No firm associated with user" };

      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.session_id, {
        expand: ["subscription", "subscription.items.data.price", "customer"],
      });

      const subRef: any = (session as any).subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (!subId) return { error: "No subscription on this checkout session yet" };

      const sub =
        typeof subRef === "string"
          ? await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] })
          : subRef;

      let customer: any = null;
      const custRef: any = (session as any).customer;
      if (custRef && typeof custRef === "object" && !custRef.deleted) customer = custRef;
      else if (typeof custRef === "string") {
        const retrieved: any = await stripe.customers.retrieve(custRef);
        if (!retrieved?.deleted) customer = retrieved;
      }

      // Make sure the subscription carries firmId metadata so future webhooks
      // can resolve without an email lookup.
      if (sub.metadata?.firmId !== profile.firm_id) {
        await stripe.subscriptions.update(sub.id, {
          metadata: { ...sub.metadata, firmId: profile.firm_id, userId },
        });
        (sub as any).metadata = { ...sub.metadata, firmId: profile.firm_id };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { syncFirmBillingFromSubscription } = await import("@/lib/stripe-billing-sync.server");
      const result = await syncFirmBillingFromSubscription(supabaseAdmin, sub, {
        session,
        customer,
        fallbackFirmId: profile.firm_id,
        fallbackEmail: profile.email ?? undefined,
        logPrefix: "[syncFirmFromStripeSession]",
      });
      if (!result.ok) return { error: "Could not link this checkout to your firm" };
      return { ok: true };
    } catch (error) {
      console.error("[syncFirmFromStripeSession]", error);
      return { error: getStripeErrorMessage(error) };
    }
  });