## Goal
Turn the existing subscription scaffolding into a working billing flow using Lovable's seamless Stripe integration (no Stripe account or key required from you). Foundation / Studio / Practice become real Stripe products; trials convert to paid; `/billing` becomes the plan picker + manage-subscription page; a webhook keeps `firms.subscription_tier` / `subscription_status` in sync.

## What already exists (reuse, don't rebuild)
- `firms` columns: `subscription_tier`, `subscription_status`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id` + `prevent_firm_billing_changes` trigger (only `service_role` can write these — perfect for the webhook)
- Tier gating: `effectiveTier`, `TierLocked`, `UpgradeModal`, `RestrictedPreview` — all read `subscription_tier` and link to `/billing`
- `TrialBanner` already reads `trial_ends_at`
- `register.tsx` captures the chosen tier at signup
- `/billing` route stub

## Steps

### 1. Enable seamless Stripe
Call `enable_stripe_payments`. This provisions a Lovable-managed Stripe account in **test mode**, no keys needed. Going live later is a separate account-claim step in Lovable — no code change.

### 2. Set tax handling: full compliance (`managed_payments`)
Sightline is digital SaaS → eligible. Stripe handles tax registration, calculation, filing, disputes, and buyer support in ~80 countries for +3.5% per transaction. Change per transaction or turn off anytime in Lovable settings.

### 3. Create the three products in Stripe (test mode)
Using `batch_create_product` after Step 1 completes:
- Foundation — $39/mo recurring, tax code `txcd_10103001` (SaaS)
- Studio — $89/mo recurring, tax code `txcd_10103001`
- Practice — $149/mo recurring, tax code `txcd_10103001`

Store the returned Stripe price IDs in a new `billing_plans` table (tier → price_id) so code stays decoupled from hardcoded IDs and prices can be swapped without a deploy.

### 4. Migration: `billing_plans` + webhook_events dedupe
```
billing_plans(tier, stripe_price_id, monthly_amount_cents, display_name, active)
stripe_webhook_events(event_id PK, type, received_at) -- idempotency
```
Grants: `authenticated SELECT` on `billing_plans` (public price list), `service_role ALL` on both. No client-side writes.

### 5. Server function: `createCheckoutSession`
`src/lib/billing.functions.ts`, `requireSupabaseAuth` middleware.
- Input: `{ tier: 'foundation'|'studio'|'practice' }`
- Look up the firm's `stripe_customer_id`; create a Stripe customer if missing (email + firm name), persist via `supabaseAdmin`
- Create a Stripe Checkout Session:
  - `mode: 'subscription'`, line item = plan's price_id
  - `customer: <firm's stripe_customer_id>`
  - `managed_payments: { enabled: true }` (full-compliance path)
  - `success_url = /billing?status=success`, `cancel_url = /billing?status=cancelled`
  - `subscription_data.trial_end` set from firm's remaining `trial_ends_at` if still in trial (no double-charging mid-trial)
- Return the URL; client redirects

### 6. Server function: `createBillingPortalSession`
Same file. Opens Stripe's hosted customer portal for cancel / update card / view invoices. Returns the portal URL.

### 7. Webhook route: `src/routes/api/public/stripe-webhook.ts`
`/api/public/*` bypasses auth on published sites; we verify Stripe's signature ourselves.
- Read raw body, verify `stripe-signature` with timing-safe compare
- Dedupe on `stripe_webhook_events.event_id`
- Handle:
  - `checkout.session.completed` → set `stripe_subscription_id`, `subscription_status='active'`, `subscription_tier` from the plan
  - `customer.subscription.updated` → sync `subscription_status`, and `subscription_tier` (tier changes / upgrades)
  - `customer.subscription.deleted` → `subscription_status='canceled'`, drop tier back to `foundation` at period end
  - `invoice.payment_failed` → `subscription_status='past_due'`
- All writes use `supabaseAdmin` (bypasses the billing lock trigger by design)

### 8. Rebuild `/billing` page
Real UI (matches existing Sightline visual language, reuses `UpgradeModal` copy from `TIER_DETAILS`):
- Current plan card: shows tier, status (`trialing` / `active` / `past_due` / `canceled`), trial countdown or next-invoice date
- Three plan cards (Foundation / Studio / Practice) with "Upgrade" / "Downgrade" / "Current plan" buttons
- If active subscription exists → "Manage billing" button → `createBillingPortalSession`
- If no subscription (trial or none) → each plan button → `createCheckoutSession` then redirect
- Success banner when `?status=success`; refetches `useMe` and invalidates queries so `TrialBanner` / `TierLocked` update immediately

### 9. Trial-expiration enforcement
A tiny server fn `checkTrialStatus` called inside `getMyContext` (or a `useMe` post-processor): when `subscription_status='trialing'` and `trial_ends_at < now()` and no `stripe_subscription_id`, treat the firm as "trial expired" — locks all tier-gated modules with a "Trial ended — add billing to continue" state pointing to `/billing`. No cron needed; evaluated on every load.

### 10. Route the existing "Upgrade" CTAs
`UpgradeModal` and `TierLocked` already link to `/billing`. Add `?tier=<target>` so the billing page pre-selects that plan's checkout button when arriving from an upgrade prompt.

## Out of scope for this plan
- Annual pricing / discounts
- Coupons / promo codes
- Per-seat pricing (all three tiers are flat firm-level today)
- Going live (Stripe account claim happens in Lovable UI, not code)
- Email receipts (Stripe sends its own; can revisit later)

## Verification
- Test-mode checkout for each tier completes and Stripe redirects to `/billing?status=success`
- Webhook flips `subscription_tier`, `subscription_status`, `stripe_subscription_id` in `firms` (verify via `supabase--read_query`)
- `TrialBanner` disappears after successful subscribe; `TierLocked` unlocks the correct modules per tier
- Billing portal opens, cancel → webhook sets `canceled`, tier drops back to `foundation`
- Trial-expired firm without a subscription sees the "Trial ended" lock state
