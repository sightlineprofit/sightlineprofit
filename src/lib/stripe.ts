import { loadStripe, type Stripe } from "@stripe/stripe-js";

export type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const testClientToken = import.meta.env.VITE_PAYMENTS_TEST_CLIENT_TOKEN as string | undefined;
const liveClientToken = import.meta.env.VITE_PAYMENTS_LIVE_CLIENT_TOKEN as string | undefined;
const configuredPublicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;

export const CHECKOUT_ENV_STORAGE_KEY = "sightline_checkout_environment";

function configuredProductionHostname(): string | null {
  const raw = configuredPublicAppUrl?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/** Production app host — always live Stripe checkout (never sandbox). */
export function isProductionCheckoutHost(hostname: string): boolean {
  if (hostname === "sightlineprofit.com" || hostname === "www.sightlineprofit.com") {
    return true;
  }
  const configured = configuredProductionHostname();
  if (!configured) return false;
  return hostname === configured || hostname === `www.${configured}`;
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isStripeEnv(value: unknown): value is StripeEnv {
  return value === "sandbox" || value === "live";
}

export function readSavedCheckoutEnvironment(): StripeEnv | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(CHECKOUT_ENV_STORAGE_KEY);
  return isStripeEnv(saved) ? saved : null;
}

export function writeSavedCheckoutEnvironment(environment: StripeEnv) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECKOUT_ENV_STORAGE_KEY, environment);
}

function checkoutEnvironmentFromPending(): StripeEnv | null {
  if (typeof window === "undefined") return null;
  const raw =
    window.localStorage.getItem("sightline_pending_firm") ??
    window.sessionStorage.getItem("sightline_pending_firm");
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as { checkoutEnvironment?: unknown };
    return isStripeEnv(pending.checkoutEnvironment) ? pending.checkoutEnvironment : null;
  } catch {
    return null;
  }
}

function tokenForEnvironment(environment: StripeEnv): string {
  const token = environment === "sandbox" ? testClientToken : liveClientToken;
  if (environment === "sandbox" && token?.startsWith("pk_test_")) return token;
  if (environment === "live" && token?.startsWith("pk_live_")) return token;

  if (environment === "sandbox" && clientToken?.startsWith("pk_test_")) return clientToken;
  if (environment === "live" && clientToken?.startsWith("pk_live_")) return clientToken;

  throw new Error(
    environment === "sandbox"
      ? "Stripe test payments are not configured for this build."
      : "Stripe live payments are not configured for this build.",
  );
}

export function canUseStripeEnvironment(environment: StripeEnv): boolean {
  try {
    tokenForEnvironment(environment);
    return true;
  } catch {
    return false;
  }
}

function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  if (testClientToken?.startsWith("pk_test_") && !liveClientToken?.startsWith("pk_live_")) return "sandbox";
  if (liveClientToken?.startsWith("pk_live_") && !testClientToken?.startsWith("pk_test_")) return "live";
  throw new Error(
    "Stripe payments are not configured for this build. Complete Stripe go-live to enable production checkout.",
  );
}

const stripePromises: Partial<Record<StripeEnv, Promise<Stripe | null>>> = {};

export function getStripe(environment?: StripeEnv): Promise<Stripe | null> {
  const stripeEnvironment = environment ?? paymentsEnvironment();
  if (!stripePromises[stripeEnvironment]) {
    stripePromises[stripeEnvironment] = loadStripe(tokenForEnvironment(stripeEnvironment));
  }
  return stripePromises[stripeEnvironment] as Promise<Stripe | null>;
}

export function getStripeEnvironment(environment?: StripeEnv): StripeEnv {
  if (environment) {
    tokenForEnvironment(environment);
    return environment;
  }
  return paymentsEnvironment();
}

export function paymentsConfigured(): boolean {
  try {
    tokenForEnvironment(paymentsEnvironment());
    return true;
  } catch {
    return false;
  }
}

function isPreviewTestingHost(hostname: string): boolean {
  return (
    isLocalDevHost(hostname) ||
    hostname.includes("preview--")
  );
}

/** True on local dev / Lovable preview — used for Stripe test-vs-live dev notices. */
export function isStripeCheckoutTestingHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  if (isProductionCheckoutHost(hostname)) return false;
  return isPreviewTestingHost(hostname);
}

export function getPreferredCheckoutEnvironment(): StripeEnv {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (isProductionCheckoutHost(hostname)) {
      return getStripeEnvironment("live");
    }
    if (isLocalDevHost(hostname) && canUseStripeEnvironment("sandbox")) {
      return "sandbox";
    }
  }
  return paymentsEnvironment();
}

/** Resolve checkout env from URL, storage, or pending signup — production always live. */
export function resolveCheckoutEnvironment(searchEnv?: StripeEnv): StripeEnv {
  if (typeof window !== "undefined" && isProductionCheckoutHost(window.location.hostname)) {
    return getStripeEnvironment("live");
  }
  const explicitEnv = searchEnv ?? readSavedCheckoutEnvironment() ?? checkoutEnvironmentFromPending();
  return explicitEnv ? getStripeEnvironment(explicitEnv) : getPreferredCheckoutEnvironment();
}