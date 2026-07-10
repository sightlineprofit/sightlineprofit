## What’s happening

Indigo’s firm exists, but the billing fields are still empty:

- `stripe_customer_id`: empty
- `stripe_subscription_id`: empty
- `subscription_status`: still `trialing`

The app’s post-payment gate only lets users continue when the firm has a `stripe_subscription_id`, so she keeps getting sent back to billing.

The webhook route now appears in the database receipts, but the firm row was not updated. That points to the webhook receiving events but failing to link the Stripe subscription back to Indigo’s firm.

## Plan

1. **Make the webhook link payments to firms more reliably**
   - Keep using `/api/public/payments/webhook`.
   - For `checkout.session.completed`, resolve the firm from multiple sources:
     - subscription metadata
     - checkout session metadata
     - checkout `client_reference_id`
     - existing `stripe_customer_id`
     - customer metadata / customer email fallback
   - If it finds the firm, update the same billing fields the app needs to unlock access.

2. **Make checkout sessions easier to reconcile**
   - Add `client_reference_id: firm.id` to checkout session creation.
   - Keep `firmId` metadata on the session and subscription.
   - Keep caching `stripe_customer_id` on the firm before payment.

3. **Fix production reliability of billing helper code**
   - Move shared billing-sync helpers out of server-function modules and into a server-only helper module.
   - Use that helper from both the webhook route and the admin backfill function so the same update logic runs everywhere.

4. **Make backfill actually unblock stuck customers**
   - Update the admin backfill to use the new resilient lookup logic.
   - Use it for Indigo’s firm ID after the code is in place, so she does not need to wait for another webhook retry.

5. **Add better webhook failure visibility**
   - Log a clear failure when a webhook is received but cannot resolve a firm.
   - Avoid treating a dedupe receipt as proof that billing sync succeeded.

6. **Verify**
   - Confirm the published webhook endpoint responds as an existing route.
   - Confirm Stripe webhook logs no longer show unresolved-firm failures.
   - Confirm Indigo’s firm row gets `stripe_subscription_id` populated.
   - Confirm the post-auth flow can route her past billing.