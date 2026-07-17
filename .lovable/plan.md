## Goal
Run an end-to-end Playwright verification against the **live** site (`sightlineprofit.com`) using Stripe **sandbox** mode (via `?env=sandbox`), completing a real checkout with test card `4242 4242 4242 4242`, and capturing screenshots proving:
1. Post-checkout redirect lands on `/dashboard`
2. The guided onboarding tour auto-launches

## Steps

1. **Provision a test user** via Supabase admin API (`sb_secret_…`, `email_confirm: true`) so we bypass email confirmation. Use a unique `+e2e-<timestamp>@` email.

2. **Playwright script** at `/tmp/browser/live-checkout/run.py`:
   - Launch headless Chromium, viewport 1280×1800.
   - Navigate to `https://sightlineprofit.com/register?env=sandbox` to force sandbox mode (persisted via `localStorage`).
   - Screenshot each step: signup form → account creation → payment step (verify sandbox banner, not live banner) → Stripe Embedded Checkout iframe.
   - Fill Stripe iframe fields: card `4242 4242 4242 4242`, future expiry, any CVC, ZIP.
   - Submit; wait for redirect to `/post-auth?env=sandbox&session_id=...`.
   - Screenshot the post-auth waiting state and the eventual `/dashboard` landing.
   - Wait for `TourProvider` auto-launch; screenshot the tour overlay/checklist.
   - Capture console errors and final URL.

3. **Report back** with:
   - Final URL after checkout
   - Screenshots of: sandbox banner on payment step, Stripe form, post-auth transition, dashboard, active tour step
   - Any console errors or webhook-lag fallback messages
   - Confirmation the new sandbox subscription appears on the firm (via a `supabase--read_query` on `firms.stripe_subscription_id`)

4. **Cleanup:** Delete the test user + firm rows so we don't leave orphan sandbox data.

## Notes
- Uses sandbox mode only — no real card, no real charge.
- No code changes; verification only.
- If Stripe iframe selectors are flaky, fall back to `page.frame_locator("iframe[name^='__privateStripeFrame']")` and role-based selectors.
