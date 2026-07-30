-- Revert opt-in capacity_basis: firm total capacity is always automatic.

ALTER TABLE public.firm_config DROP CONSTRAINT IF EXISTS firm_config_capacity_basis_check;

ALTER TABLE public.firm_config DROP COLUMN IF EXISTS capacity_basis;

-- Existing roster rows: default productive hours from expected billable hours.
UPDATE public.firm_members
SET productive_hrs_per_week = COALESCE(expected_hrs_per_week, 40)
WHERE role_type <> 'principal'
  AND is_active IS NOT FALSE
  AND productive_hrs_per_week IS NULL;

COMMENT ON COLUMN public.firm_members.productive_hrs_per_week IS
  'Client-project hours per week included in firm-wide capacity (aligned rate denominator).';
