## Diagnosis

The register flow stores the "needs payment" intent in `sessionStorage` before calling `supabase.auth.signUp`. When the user clicks the confirmation link in their email, it opens in a **new tab / new browser context**, so `sessionStorage` is empty. `/post-auth` then reads `pending?.needsPayment` as `undefined`/false and routes straight to `/onboarding` — skipping Stripe checkout entirely.

Two failure paths in `src/routes/post-auth.tsx`:

1. **New firm branch** (no `firm_id` yet): relies on `pending.needsPayment`. Missing after email click → `/onboarding`.
2. **Existing firm branch** (firm already created on a prior tab): only checks `onboarding_completed` — never checks whether Stripe checkout was completed → also routes to `/onboarding`.

## Fix

Make payment gating driven by **server state**, not `sessionStorage`. A firm that has not completed checkout has `stripe_subscription_id = null` (and/or `stripe_customer_id = null`) — that is the reliable signal.

### 1. `src/routes/post-auth.tsx`

- After resolving `ctx`, compute `needsPayment = !firm.stripe_subscription_id` for both branches (new firm and existing firm), for non-super-admin users only.
- Existing-firm branch: if `needsPayment`, redirect to `/register?step=payment` before the onboarding/landing check.
- New-firm branch: always redirect to `/register?step=payment` after `createFirm` (the pending flag is no longer authoritative — a freshly created firm has no subscription yet by definition). Keep reading `sightline_pending_firm` only to enrich `firmName`/`ownerName`/`billingFrequency`/`stripePriceId` when present.
- Fall back to `user_metadata` (`firm_name`, `name`) for cross-tab confirmations where sessionStorage was lost — already partially wired; keep and rely on it.

### 2. `src/routes/register.tsx`

- Switch the pending-firm stash from `sessionStorage` to `localStorage` so the email-click tab can still read `firmName`, `ownerName`, `billingFrequency`, and `stripePriceId`. Clear it after `/post-auth` consumes it (update the `removeItem` call to match).
- Keep the current step-1 UX: if `signUp` returns no session, show the "check your email" toast.

### 3. Verification

- Sign up with an email that requires confirmation → click link in a fresh tab → land on `/register?step=payment`, not `/onboarding`.
- Sign up with a session established immediately (Google or auto-confirm) → still routed to `/register?step=payment`.
- Existing user whose firm has `stripe_subscription_id` but `onboarding_completed=false` → `/onboarding` (unchanged).
- Existing user with subscription and completed onboarding → landing page per role (unchanged).
- Super admin path unchanged.

### Out of scope

No changes to `createFirmForCurrentUser`, Stripe checkout, or the payment UI itself — this is a routing fix only.
