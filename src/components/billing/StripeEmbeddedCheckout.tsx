import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/billing.functions";
import type { CheckoutPriceKey } from "@/lib/stripe.server";

export function StripeEmbeddedCheckoutPane({
  priceKey,
  returnUrl,
}: {
  priceKey: CheckoutPriceKey;
  returnUrl: string;
}) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCheckoutSession({
      data: { priceKey, returnUrl, environment: getStripeEnvironment() },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Stripe did not return a client secret");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="rounded-md bg-white p-2 shadow-sm">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}