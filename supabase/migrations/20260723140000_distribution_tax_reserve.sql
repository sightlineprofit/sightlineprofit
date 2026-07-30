ALTER TABLE public.owner_compensation
  ADD COLUMN IF NOT EXISTS distribution_tax_rate numeric(5,4);

COMMENT ON COLUMN public.owner_compensation.distribution_tax_rate IS
  'Effective personal income tax rate on distributions (decimal fraction, e.g. 0.28 = 28%). Null = no gross-up.';

ALTER TABLE public.project_cost_snapshots
  ADD COLUMN IF NOT EXISTS distribution_tax_reserve numeric(12,4) NOT NULL DEFAULT 0;

ALTER TABLE public.project_cost_snapshots
  ADD COLUMN IF NOT EXISTS distribution_tax_rate numeric(5,4);

COMMENT ON COLUMN public.project_cost_snapshots.distribution_tax_reserve IS
  'Income tax gross-up reserve on owner distributions at snapshot time (informational).';

COMMENT ON COLUMN public.project_cost_snapshots.distribution_tax_rate IS
  'Effective distribution income tax rate stored at snapshot time (decimal fraction).';
