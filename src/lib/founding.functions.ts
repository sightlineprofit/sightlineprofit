import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FOUNDING_PRICE_KEYS, CHECKOUT_PRICE_KEYS, type CheckoutPriceKey } from "@/lib/stripe.server";

export type FoundingBillingFrequency = "monthly" | "annual";

export type FoundingQuoteResult = {
  slotsRemaining: number;
  foundingActive: boolean;
  priceId: string;
  amountCents: number;
  isFounding: boolean;
  frequency: FoundingBillingFrequency;
};

const PRICE_TABLE: Record<
  FoundingBillingFrequency,
  { founding: string; standard: string; foundingCents: number; standardCents: number }
> = {
  monthly: {
    founding: "sightline_founding_monthly",
    standard: "sightline_standard_monthly",
    foundingCents: 3999,
    standardCents: 6999,
  },
  annual: {
    founding: "sightline_founding_annual",
    standard: "sightline_standard_annual",
    foundingCents: 39990,
    standardCents: 69990,
  },
};

/** Founding ($39.99) vs standard ($69.99) for display and checkout. */
export function firmUsesFoundingPricing(
  firm: { stripe_price_id?: string | null } | null | undefined,
  foundingSlotsActive: boolean,
): boolean {
  const priceId = firm?.stripe_price_id ?? null;
  if (priceId && FOUNDING_PRICE_KEYS.has(priceId)) return true;
  if (priceId) return false;
  return foundingSlotsActive;
}

/** Stripe lookup_key for checkout — respects locked-in firm price or live founding slots. */
export function resolveCheckoutPriceKey(
  firm: { stripe_price_id?: string | null; billing_frequency?: string | null } | null | undefined,
  frequency: FoundingBillingFrequency,
  quote?: { priceId?: string; foundingActive?: boolean } | null,
): CheckoutPriceKey {
  const priceId = firm?.stripe_price_id ?? null;
  if (priceId && FOUNDING_PRICE_KEYS.has(priceId)) {
    return frequency === "annual" ? "sightline_founding_annual" : "sightline_founding_monthly";
  }
  if (priceId) {
    return frequency === "annual" ? "sightline_standard_annual" : "sightline_standard_monthly";
  }
  if (quote?.priceId && (CHECKOUT_PRICE_KEYS as readonly string[]).includes(quote.priceId)) {
    return quote.priceId as CheckoutPriceKey;
  }
  const foundingActive = quote?.foundingActive ?? false;
  if (foundingActive) {
    return frequency === "annual" ? "sightline_founding_annual" : "sightline_founding_monthly";
  }
  return frequency === "annual" ? "sightline_standard_annual" : "sightline_standard_monthly";
}

/**
 * Ask the backend which price a signup should receive right now.
 * Public server fn — no auth required so /register can call it before the
 * account is created.
 */
export const getFoundingQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ frequency: z.enum(["monthly", "annual"]) }).parse(d))
  .handler(async ({ data }): Promise<FoundingQuoteResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Count rows in founding_access. Function is available too, but a direct
    // count keeps this callable even if the RPC isn't in types yet.
    const { count } = await supabaseAdmin
      .from("founding_access" as any)
      .select("firm_id", { count: "exact", head: true });
    const used = count ?? 0;
    const slotsRemaining = Math.max(0, 100 - used);
    const foundingActive = slotsRemaining > 0;
    const row = PRICE_TABLE[data.frequency];
    const priceId = foundingActive ? row.founding : row.standard;
    const amountCents = foundingActive ? row.foundingCents : row.standardCents;
    return {
      slotsRemaining,
      foundingActive,
      priceId,
      amountCents,
      isFounding: FOUNDING_PRICE_KEYS.has(priceId),
      frequency: data.frequency,
    };
  });