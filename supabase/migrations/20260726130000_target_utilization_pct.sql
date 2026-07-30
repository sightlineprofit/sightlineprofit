-- Firm-wide planning utilization for revenue capacity (not the same as logged utilization).
ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS target_utilization_pct numeric;

COMMENT ON COLUMN public.firm_config.target_utilization_pct IS
  'Intentional billable utilization % (0–100) applied to revenue capacity planning. Null = 100% of configured target hours.';

ALTER TABLE public.firm_config
  DROP CONSTRAINT IF EXISTS firm_config_target_utilization_pct_range;

ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_target_utilization_pct_range
  CHECK (
    target_utilization_pct IS NULL
    OR (target_utilization_pct >= 0 AND target_utilization_pct <= 100)
  );
