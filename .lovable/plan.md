Put both the local preview and the published site back into Stripe test/sandbox mode.

Current state:
- `.env.development` already contains a sandbox (`pk_test_...`) token, so the local preview is already in test mode.
- `.env.production` contains a live (`pk_live_...`) token, so the published site (sightlineprofit.lovable.app / custom domains) is in live mode and can accept real payments.
- The app derives the Stripe environment from the `VITE_PAYMENTS_CLIENT_TOKEN` prefix, so changing the production token changes both the frontend Stripe.js environment and the server-side connection.

Plan:

1. Verify local preview mode
   - Confirm `npm run dev` / preview loads the sandbox token from `.env.development`.
   - Confirm the test-mode banner appears on checkout pages.

2. Switch the published site to test mode
   - Replace the `VITE_PAYMENTS_CLIENT_TOKEN` value in `.env.production` with the sandbox (`pk_test_...`) token from `.env.development`.
   - This is safe because the token is a publishable (public) key.
   - After the next publish, the production build will initialize Stripe.js in sandbox mode and server functions will route to the sandbox connection.

3. UI/UX verification
   - Confirm `PaymentTestModeBanner` renders the test-mode banner on the published site after republish.
   - Confirm checkout flows use sandbox test cards (e.g., 4242 4242 4242 4242).

4. Publish the change
   - Republish the project so the updated `.env.production` is used in the production build.

Important implications:
- The published site will no longer accept real payments.
- Any existing live Stripe subscriptions that were created before the switch will continue billing through Stripe, but new checkouts opened by the app will be sandbox sessions.
- This does not disconnect the live Stripe account; it only changes which environment the app uses for checkout. Reverting later is as simple as restoring the live token in `.env.production` and republishing.

No database or backend schema changes are required.