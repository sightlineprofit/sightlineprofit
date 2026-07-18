## Goal
Verify the full post-payment flow end-to-end against the **preview** build (which ships the `pk_test_` sandbox token), capturing screenshots that prove: signup → sandbox Stripe checkout → `/post-auth` → `/dashboard` → guided tour auto-launches.

## Approach

1. **Target URL:** `https://project--ece2c99c-2c7b-4477-ad89-4702710a02f3-dev.lovable.app` (stable preview URL that serves the latest preview build with the sandbox token baked in). Fall back to the `id-preview--…` URL if the stable one is unreachable.

2. **Provision a confirmed test user** via Supabase admin API using `SUPABASE_SERVICE_ROLE_KEY` / `sb_secret_…` against project `ncekwpeojcutmunadrbj`:
   - `supabase.auth.admin.createUser({ email: "e2e+<ts>@sightlineprofit.com", password, email_confirm: true })` so we skip the email confirmation gate.

3. **Playwright script** at `/tmp/browser/preview-checkout/run.py` (headless Chromium, viewport 1280×1800):
   - Navigate to `/register` on the preview host, screenshot the signup step.
   - Sign in as the provisioned user (bypasses the email verification wait) so we land on `/register?step=payment` with a firm already stashed, OR walk through the signup form fresh — whichever the code path expects. Screenshot the payment step and confirm the **orange "Test mode is active"** banner (not the red live banner).
   - Fill the Stripe Embedded Checkout iframe (`iframe[name^="__privateStripeFrame"]`) with `4242 4242 4242 4242`, future expiry, any CVC, ZIP. Screenshot before submit.
   - Submit; wait for redirect to `/post-auth?env=sandbox&session_id=…`. Screenshot the transition state.
   - Wait for navigation to `/dashboard` (up to ~30s to cover webhook lag + fallback sync). Screenshot the dashboard.
   - Wait for `TourProvider` auto-launch overlay/checklist; screenshot the active tour step.
   - Capture console errors and the final URL throughout.

4. **Verify server-side state** via `supabase--read_query`:
   - Confirm the new firm row has `stripe_subscription_id` populated and `subscription_status = 'trialing'` or `'active'`.

5. **Report back** with:
   - Final URL after checkout completes.
   - Screenshots: sandbox banner on payment step, Stripe card form, post-auth transition, dashboard landing, tour overlay.
   - Any console errors or timeout fallbacks encountered.
   - Confirmation the sandbox subscription is attached to the firm.

6. **Cleanup:** Delete the test user and firm rows (cascades via `auth.users` → `profiles` → `firms`) so no orphan sandbox data is left.

## Notes
- No code changes — verification only.
- Sandbox mode only; no real card, no real charge.
- If the Stripe iframe selectors are flaky, fall back to `page.frame_locator("iframe[title*='Secure']")` + role-based selectors (`get_by_placeholder("1234 1234 1234 1234")`).
- If the webhook doesn't land in 15s, the `/post-auth` fallback `syncFirmFromStripeSession` should still land us on `/dashboard` — screenshot whichever state we end up in and report honestly.
