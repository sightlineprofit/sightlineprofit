/** Whether the firm can use the app without being sent back through /register payment. */
export function firmHasAppAccess(
  firm:
    | {
        stripe_subscription_id?: string | null;
        subscription_status?: string | null;
        trial_ends_at?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!firm) return false;
  if (firm.stripe_subscription_id) return true;
  const status = firm.subscription_status;
  if (status === "active" || status === "trialing") return true;
  const trialEnd = firm.trial_ends_at ? new Date(firm.trial_ends_at).getTime() : null;
  if (trialEnd && trialEnd > Date.now()) return true;
  return false;
}
