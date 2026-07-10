## What's happening

After a user finishes Stripe checkout on `/register?step=payment`, Stripe redirects them to `/post-auth`. `/post-auth` reads `firm.stripe_subscription_id` once — if it's not there yet, it bounces them back to `/register?step=payment`. The problem is a **race**: Stripe's webhook (`/api/public/stripe-webhook`) is what writes `stripe_subscription_id` onto the firm, and it typically lands 1–5 seconds after the browser redirect. On first read the field is still `null`, so the user gets kicked back to the payment form and can never get past it (the auth logs confirm signup + login succeeded — this is purely the post-payment gate looping).

## Fix

Add a short polling window in `/post-auth` for users who just came back from Stripe, so the page waits for the webhook to mark the firm as subscribed before deciding where to send them. If the poll times out, show a clear message and a manual "I've completed payment" retry instead of silently redirecting back to checkout.

### Changes

**`src/routes/post-auth.tsx`** (only file changed)
1. Detect Stripe return by checking for `session_id` in the URL search params (Stripe appends `?session_id=…` when it redirects to `return_url`). We'll also treat any arrival with `firm_id` set but `stripe_subscription_id` still null as a candidate for polling, since the current returnUrl in `register.tsx` is `${origin}/post-auth` without the session id.
2. When a firm exists but `stripe_subscription_id` is missing, poll `getMyContext()` every 1.5s for up to ~15s (10 attempts). As soon as `firm.stripe_subscription_id` appears, continue with the existing routing (`landingPathFor`).
3. If polling exhausts, stop redirecting to `/register?step=payment` automatically. Instead render an inline state: "We're confirming your payment with Stripe…" → after timeout: "This is taking longer than expected." with two buttons — **Retry** (re-runs the poll) and **Return to payment** (only shown after timeout so the user isn't looped back mid-processing).
4. Also append `?session_id={CHECKOUT_SESSION_ID}` to the Stripe `returnUrl` in `src/routes/register.tsx` so post-auth can distinguish a Stripe return from a normal auth landing (used only to pick a longer poll window / friendlier copy — routing decisions still key off DB state).

### Why not change the webhook or add server-side wait

The webhook already writes the right fields correctly (confirmed by reading `stripe-webhook.ts`). The only defect is the client assuming that write has already happened. Polling on the return page is the standard fix for this race (matches the pattern in the project's "similar problem" reference) and doesn't touch billing logic, DB schema, or Stripe configuration.

### Out of scope

- No changes to `stripe-webhook.ts`, `billing.functions.ts`, `firm.functions.ts`, or DB schema.
- No changes to the checkout UI or pricing.
- Not touching the tour, dashboard, or any Phase B work.

### Verification

- Sign up new user → confirm email → complete Stripe test checkout (`4242…`) → `/post-auth` shows "Confirming your payment…" briefly, then lands on dashboard/onboarding target.
- Simulate webhook delay (throttle network) → polling continues up to ~15s → success path still works.
- If polling times out (webhook truly failed) → user sees explicit message + Retry, not an infinite bounce.
