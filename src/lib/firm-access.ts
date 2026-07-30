/** Whether the firm can use the app without being sent back through /register payment. */
export function firmHasAppAccess(
  firm:
    | {
        stripe_subscription_id?: string | null;
        subscription_status?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!firm) return false;
  // Trial starts when Stripe Checkout creates a subscription (status trialing or active).
  if (firm.stripe_subscription_id) return true;
  if (firm.subscription_status === "active") return true;
  return false;
}
