import Stripe from "stripe";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("STRIPE_SANDBOX_API_KEY")
    : getEnv("STRIPE_LIVE_API_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getConnectionApiKey(env), {
    apiVersion: "2026-03-25.dahlia",
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string; type?: string; code?: string; decline_code?: string;
      param?: string; requestId?: string;
      raw?: { message?: string; type?: string; code?: string; decline_code?: string; param?: string; requestId?: string };
    };
    const message = e.raw?.message ?? e.message;
    if (message) {
      const details = [
        e.raw?.type ?? e.type,
        e.raw?.code ?? e.code,
        e.raw?.decline_code ?? e.decline_code,
        e.raw?.param ?? e.param,
        e.raw?.requestId ?? e.requestId,
      ].filter(Boolean);
      return details.length ? `${message} (${details.join(", ")})` : message;
    }
  }
  return "Stripe request failed";
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ id: string; type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret = env === "sandbox"
    ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");
  if (!v1Signatures.includes(expected)) throw new Error("Invalid webhook signature");

  return JSON.parse(body);
}

export type Tier = "studio" | "practice";

/**
 * Every Stripe price lookup_key the app knows about → the tier it grants.
 * Tier is now single-plan ("practice"). Legacy keys stay in the map so
 * historic subscriptions on old lookup keys still normalize cleanly through
 * the webhook and /billing views.
 */
export const PRICE_TO_TIER: Record<string, Tier> = {
  // Current single-plan prices
  sightline_founding_monthly: "practice",
  sightline_founding_annual: "practice",
  sightline_standard_monthly: "practice",
  sightline_standard_annual: "practice",
  // Legacy — remain valid subscriptions, all grant full (practice) access
  sightline_early_foundation_monthly: "practice",
  sightline_studio_monthly: "practice",
  sightline_studio_monthly_v2: "practice",
  sightline_practice_monthly: "practice",
  sightline_practice_monthly_v2: "practice",
  sightline_early_practice_monthly: "practice",
};

/** Founding-rate price keys — used to detect founding_access grants. */
export const FOUNDING_PRICE_KEYS = new Set<string>([
  "sightline_founding_monthly",
  "sightline_founding_annual",
]);

/** Default price to open at checkout for each standard tier (legacy /billing). */
export const DEFAULT_TIER_PRICE: Record<Tier, string> = {
  studio: "sightline_standard_monthly",
  practice: "sightline_standard_monthly",
};

/** Every price key that a checkout session is allowed to open. */
export const CHECKOUT_PRICE_KEYS = [
  "sightline_founding_monthly",
  "sightline_founding_annual",
  "sightline_standard_monthly",
  "sightline_standard_annual",
  // Legacy checkout keys (still permitted for existing /billing UI)
  "sightline_studio_monthly_v2",
  "sightline_practice_monthly_v2",
  "sightline_early_foundation_monthly",
  "sightline_early_practice_monthly",
] as const;

export type CheckoutPriceKey = (typeof CHECKOUT_PRICE_KEYS)[number];