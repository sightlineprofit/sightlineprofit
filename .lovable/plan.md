## Root cause

Indigo (and every new user) is stuck because the Stripe webhook has never once landed in this app. Server logs show ~7 recent POSTs from Stripe, all returning **404**:

```
POST /api/public/payments/webhook?env=sandbox → 404
```

The Stripe webhook was registered by `enable_stripe_payments` at the Lovable-standard path `/api/public/payments/webhook`, but the app's handler file is at `src/routes/api/public/stripe-webhook.ts`, serving `/api/public/stripe-webhook`. Paths don't match → every event is dropped.

Consequences:
- `stripe_webhook_events` table has **0 rows** ever (verified).
- Indigo's firm row has `stripe_customer_id = null`, `stripe_subscription_id = null`, `subscription_status = "trialing"` — the webhook that was supposed to write these never ran.
- `/post-auth` reads `firm.stripe_subscription_id`, sees `null`, sends her back to `/register?step=payment` in a loop (which is exactly the symptom).

The polling fix we shipped earlier doesn't help because there is no webhook arriving to wait for — it just extends the "confirming payment…" screen before still timing out.

## Fix

### 1. Move the webhook route to the path Stripe is actually calling

Rename `src/routes/api/public/stripe-webhook.ts` → `src/routes/api/public/payments/webhook.ts`. Handler contents stay identical (signature verification, event handling, `?env=` param, DB writes are all fine). This immediately makes every incoming Stripe event a 200 and populates `firms.stripe_subscription_id` / `stripe_customer_id` / `subscription_status` as designed.

Stripe retries failed webhooks for up to 3 days, so once the path is live, several of the already-attempted deliveries (including Indigo's) will re-arrive on their own and self-heal the affected firms.

### 2. Backfill Indigo's firm now, so she isn't waiting on Stripe retries

Add a one-shot admin server function `backfillFirmFromStripe({ firmId, environment })` in `src/lib/admin.functions.ts` (super-admin only, protected by `requireSupabaseAuth` + `is_super_admin` check). It:

1. Looks up the firm.
2. Searches Stripe customers by `metadata['firmId']:'<firmId>'` (falling back to owner email) to find the Stripe customer.
3. Lists that customer's subscriptions, picks the active/trialing one.
4. Runs the same upsert logic already in the webhook (`upsertFromSubscription`-equivalent) via `supabaseAdmin` — sets `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `stripe_price_id`, `billing_frequency`, `trial_ends_at`, `current_period_end`.
5. Returns a summary so we can call it from a small "Backfill from Stripe" button in `/admin` (or invoke it manually via the console once).

We refactor the webhook's `upsertFromSubscription` and `firmIdForSubscription` helpers out of the route file into a plain module (e.g. `src/lib/stripe-sync.server.ts`) so both the webhook and the backfill fn share one implementation. The webhook keeps its behavior byte-for-byte.

### 3. Verify

- After deploy: Stripe dashboard shows recent webhook attempts returning 200; `select count(*) from stripe_webhook_events` > 0.
- Indigo's firm row: `stripe_subscription_id` populated, `subscription_status` = `trialing` (with real Stripe sub id) or `active`.
- Indigo signs in → `/post-auth` sees the subscription → lands on dashboard, no loop.
- New user sign-up + Stripe test checkout (`4242…`) → post-payment redirect completes on first poll cycle.

## Out of scope

- No changes to checkout UI, pricing, or `createCheckoutSession`.
- No changes to `prevent_firm_billing_changes` trigger — the webhook writes go through `supabaseAdmin`, which is the intended service-role bypass path.
- Not re-registering the webhook endpoint on the Stripe side; moving our route to the already-registered URL is simpler and avoids touching provisioning.
- No retroactive fix for other firms — Stripe's own retry (up to 3 days) will handle any account whose original delivery happened in the last 72h; the admin backfill fn covers anyone older or urgent.

## Files touched

- **Renamed**: `src/routes/api/public/stripe-webhook.ts` → `src/routes/api/public/payments/webhook.ts` (also update the `createFileRoute("/api/public/stripe-webhook")` string to `/api/public/payments/webhook`).
- **New**: `src/lib/stripe-sync.server.ts` — shared `upsertFromSubscription`, `markCanceled`, `markPastDue`, `firmIdForSubscription`.
- **Edited**: webhook handler imports helpers from `stripe-sync.server`.
- **Edited**: `src/lib/admin.functions.ts` — adds `backfillFirmFromStripe`.
- **Edited (optional, one line)**: `src/routes/_authenticated/admin.tsx` — adds a "Backfill billing from Stripe" button per firm for super-admins. If out of scope for this pass, we skip the button and call the fn from a one-off `bunx tsx` invocation for Indigo.
