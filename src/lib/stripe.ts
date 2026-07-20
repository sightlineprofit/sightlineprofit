import { loadStripe, type Stripe } from "@stripe/stripe-js";

export type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const testClientToken = import.meta.env.VITE_PAYMENTS_TEST_CLIENT_TOKEN as string | undefined;
const liveClientToken = import.meta.env.VITE_PAYMENTS_LIVE_CLIENT_TOKEN as string | undefined;

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
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("preview--") ||
    hostname.endsWith(".workers.dev")
  );
}

/** True on localhost / preview hosts — used to show Stripe test-vs-live dev notices. */
export function isStripeCheckoutTestingHost(): boolean {
  if (typeof window === "undefined") return false;
  return isPreviewTestingHost(window.location.hostname);
}

export function getPreferredCheckoutEnvironment(): StripeEnv {
  if (typeof window !== "undefined" && isPreviewTestingHost(window.location.hostname) && canUseStripeEnvironment("sandbox")) {
    return "sandbox";
  }
  return paymentsEnvironment();
}