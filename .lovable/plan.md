## Root cause

Kristin's checkout **succeeded** in Stripe — the webhook events landed at 20:22:01 (`checkout.session.completed` + `customer.subscription.created`, both recorded in `stripe_webhook_events`). But her `firms` row still has `stripe_customer_id = NULL` and `stripe_subscription_id = NULL`, so `/post-auth` never sees `hasSub` become true and keeps looping back to `/register?step=payment`.

The webhook handler in `src/routes/api/public/payments/webhook.ts` calls `syncFirmBillingFromSubscription` with `supabaseAdmin`, which does `admin.from("firms").update({ stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, ... })`. That update hits the `firms_prevent_billing_changes` trigger, whose bypass condition is:

```sql
IF current_setting('request.jwt.claim.role', true) = 'service_role' OR public.is_super_admin() THEN
  RETURN NEW;
```

The project uses the new **`sb_secret_*`** service key (see `AGENTS.md` note and the existing comment in `src/lib/admin.functions.ts` lines 79–83). These keys **do not populate `request.jwt.claim.role`** through PostgREST, so the bypass never fires and every webhook write to a billing column throws `Billing and ownership columns can only be modified by billing services or super admins`. The webhook handler catches it, logs, returns 500, and Stripe's retries hit the same wall.

This also explains the other stuck signups in the list (Gossett, Lofty, Lemon Drop, Lemonade, Dads are Best — all `has_cust=false, has_sub=false`). Indigo's row only has values because it was likely backfilled manually via a direct DB session.

## Plan

### 1. Migration: broaden the trigger's bypass

Update `public.prevent_firm_billing_changes` to also allow the Postgres role itself (`current_user = 'service_role'`), which is reliable regardless of key format. Apply the same fix to `public.prevent_super_admin_self_grant` for consistency.

```sql
create or replace function public.prevent_firm_billing_changes()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if current_user = 'service_role'
     or current_setting('request.jwt.claim.role', true) = 'service_role'
     or public.is_super_admin() then
    return new;
  end if;
  if new.subscription_tier      is distinct from old.subscription_tier
     or new.subscription_status is distinct from old.subscription_status
     or new.stripe_customer_id  is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.trial_ends_at       is distinct from old.trial_ends_at
     or new.owner_id            is distinct from old.owner_id then
    raise exception 'Billing and ownership columns can only be modified by billing services or super admins';
  end if;
  return new;
end $$;
```

Same shape applied to `prevent_super_admin_self_grant`.

### 2. Backfill the stuck firms from Stripe

Once the trigger is fixed, call the existing `backfillFirmBillingFromStripe` server function for each stuck firm (it already searches Stripe by `metadata['firmId']` and calls `syncFirmBillingFromSubscription`). Firms to backfill:

- Orchid + Iris Design (Kristin) — `f2a619c4-c2d3-4196-a8e4-93f43c4f31d8`
- Any other trialing firm with `stripe_customer_id is null` (Gossett, Lofty, Lemon Drop, Lemonade, Dads are Best) — but only if they actually completed Stripe checkout.

I'll invoke the existing admin backfill through the server tool for Kristin first and verify her row updates, then check the others.

### 3. No app-code changes required

The webhook, checkout, and post-auth polling logic are correct — the failure was strictly at the DB trigger boundary. No need to touch `src/routes/api/public/payments/webhook.ts`, `src/lib/stripe-billing-sync.server.ts`, or `src/routes/post-auth.tsx`.

### 4. Remove now-stale workaround comment

Update the comment on lines 79–83 of `src/lib/admin.functions.ts` to note that `supabaseAdmin` writes are now safe post-migration (keep using `context.supabase` for the super-admin path since it's still correct).

## Verification

- Query `firms` for Kristin: `stripe_customer_id` and `stripe_subscription_id` should be populated, `subscription_status = 'trialing'`, `trial_ends_at` set from the Stripe subscription.
- Manually POSTing a duplicate webhook to `/api/public/payments/webhook?env=…` should succeed (idempotency insert dedupes, sync runs cleanly).
- Have Kristin refresh — `/post-auth` should route her forward on the next call to `getCtx()`.
