-- Prompt 4: firm capacity basis + retainer project fields

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS capacity_basis text NOT NULL DEFAULT 'owner_only';

ALTER TABLE public.firm_config DROP CONSTRAINT IF EXISTS firm_config_capacity_basis_check;

ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_capacity_basis_check
  CHECK (capacity_basis IN ('owner_only', 'firm_total'));

COMMENT ON COLUMN public.firm_config.capacity_basis IS
  'owner_only = aligned rate denominator uses principal hours only; firm_total includes team productive hours.';

ALTER TABLE public.firm_members
  ADD COLUMN IF NOT EXISTS productive_hrs_per_week numeric;

COMMENT ON COLUMN public.firm_members.productive_hrs_per_week IS
  'Billable/client-project hours per week for capacity denominator when capacity_basis=firm_total.';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS monthly_retainer_fee numeric(12, 2),
  ADD COLUMN IF NOT EXISTS retainer_start_date date;

COMMENT ON COLUMN public.projects.monthly_retainer_fee IS
  'Fixed monthly fee when pricing_method=retainer.';
COMMENT ON COLUMN public.projects.retainer_start_date IS
  'Engagement start for retainer month counting.';

-- Backfill from legacy retainer columns when present (optional prior migration).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'retainer_monthly_amount'
  ) THEN
    UPDATE public.projects
    SET
      monthly_retainer_fee = COALESCE(monthly_retainer_fee, retainer_monthly_amount),
      retainer_start_date = COALESCE(retainer_start_date, start_date)
    WHERE pricing_method = 'retainer';
  END IF;
END $$;
