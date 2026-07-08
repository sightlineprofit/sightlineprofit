
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_banner_dismissed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_landing_page text;

ALTER TABLE public.firms
  DROP CONSTRAINT IF EXISTS firms_default_landing_page_check;

ALTER TABLE public.firms
  ADD CONSTRAINT firms_default_landing_page_check
  CHECK (default_landing_page IS NULL OR default_landing_page IN
    ('dashboard','projects','capacity','time_calendar','rate_architecture'));

-- Backfill: any firm that already has firm_config OR a stripe subscription is
-- treated as fully onboarded and the welcome banner is suppressed.
UPDATE public.firms f
   SET onboarding_completed = true,
       welcome_banner_dismissed = true
 WHERE onboarding_completed = false
   AND (
     f.stripe_subscription_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.firm_config c WHERE c.firm_id = f.id)
   );
