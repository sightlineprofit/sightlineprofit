ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS growth_signals jsonb NOT NULL DEFAULT '{}'::jsonb;