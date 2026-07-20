ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS pricing_structure text NOT NULL DEFAULT 'hourly';

ALTER TABLE public.firm_config
  DROP CONSTRAINT IF EXISTS firm_config_pricing_structure_check;

ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_pricing_structure_check
  CHECK (pricing_structure IN ('hourly', 'flat_fee', 'both'));
