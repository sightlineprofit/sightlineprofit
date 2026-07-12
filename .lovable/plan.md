**Why this is happening**

The app chooses Stripe mode from the publishable token prefix in `src/lib/stripe.ts`:

```text
pk_test_... -> sandbox/test
pk_live_... -> live
```

Right now:

```text
.env.development = pk_test_...
.env.production  = pk_live_...
```

So preview/dev builds should use test mode, but the published/custom-domain production build will always use live mode. That is why the test card `4242 4242 4242 4242` is declined: it is being entered into a live checkout session.

**Plan**

1. **Make test mode explicit for your testing path**
   - Change the payment environment selection so the payment screen can intentionally run in test mode for preview/testing, instead of silently following the live production token.
   - Keep the live production token available so real checkout can still work later.

2. **Add a visible mode indicator on the payment screen**
   - Show a clear test-mode banner when checkout is using the test environment.
   - Show a live-mode warning when the page is using the live token, so it is obvious before entering card details.

3. **Guard against accidental live test-card use**
   - If checkout is live, show copy that test cards will be declined.
   - If checkout is test, use the test client token and pass `environment: "sandbox"` to the server function.

4. **Verify the fix**
   - Confirm the payment screen mounts Embedded Checkout in test mode.
   - Confirm the server function receives `environment: "sandbox"`.
   - Confirm the Stripe decline message no longer says the request was in live mode when using the test card.

**Expected result**

You’ll be able to get past the payment screen with test cards during testing, and live mode will stop appearing unexpectedly on the testing flow.