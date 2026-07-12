import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/billing.functions";
import type { CheckoutPriceKey } from "@/lib/stripe.server";
import type { StripeEnv } from "@/lib/stripe";

export function StripeEmbeddedCheckoutPane({
  priceKey,
  returnUrl,
  environment,
}: {
  priceKey: CheckoutPriceKey;
  returnUrl: string;
  environment?: StripeEnv;
}) {
  const checkoutEnvironment = getStripeEnvironment(environment);

  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCheckoutSession({
      data: { priceKey, returnUrl, environment: checkoutEnvironment },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Stripe did not return a client secret");
    return result.clientSecret;
  };

  return (
    <div className="space-y-3">
      <PaymentEnvironmentNotice environment={checkoutEnvironment} />
      <div id="checkout" className="rounded-md bg-white p-2 shadow-sm">
      <EmbeddedCheckoutProvider
        key={`${priceKey}-${checkoutEnvironment}`}
        stripe={getStripe(checkoutEnvironment)}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}

function PaymentEnvironmentNotice({ environment }: { environment: StripeEnv }) {
  if (environment === "sandbox") {
    return (
      <div className="rounded-md border px-3 py-2 text-center text-xs" style={{ background: "#FFF7ED", borderColor: "#FDBA74", color: "#9A3412" }}>
        Test mode is active. Use Stripe test cards only; no real payment will be charged.
      </div>
    );
  }

  return (
    <div className="rounded-md border px-3 py-2 text-center text-xs" style={{ background: "#FEF2F2", borderColor: "#FCA5A5", color: "#991B1B" }}>
      Live mode is active. Test cards will be declined, and real cards can be charged after the trial.
    </div>
  );
}