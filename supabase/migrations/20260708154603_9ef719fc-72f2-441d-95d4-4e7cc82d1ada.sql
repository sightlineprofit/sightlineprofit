-- Billing hygiene: separate trial end from renewal date, track past_due entry time,
-- and set a real 14-day trial on any firm that doesn't yet have one.

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

-- Backfill: existing "trialing" rows without trial_ends_at get 14 days from now.
UPDATE public.firms
   SET trial_ends_at = now() + interval '14 days'
 WHERE subscription_status = 'trialing'
   AND trial_ends_at IS NULL;

-- Move any renewal-date values we previously wrote into trial_ends_at over to
-- current_period_end for paid subscriptions (trial_ends_at should only reflect
-- an actual trial). We can't perfectly distinguish, so we do it only when
-- the firm is no longer trialing and has a subscription id.
UPDATE public.firms
   SET current_period_end = trial_ends_at,
       trial_ends_at = NULL
 WHERE stripe_subscription_id IS NOT NULL
   AND subscription_status <> 'trialing'
   AND trial_ends_at IS NOT NULL
   AND current_period_end IS NULL;

-- New firms should get a 14-day trial by default. handle_new_user only creates
-- profiles; firm creation happens in createFirmForCurrentUser. Add a column
-- default so any future insert path also gets it.
ALTER TABLE public.firms
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
