ALTER TABLE public.firm_config 
  ADD COLUMN IF NOT EXISTS rate_insight_shown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aligned_rate_at_signup numeric;