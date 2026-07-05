
ALTER TABLE public.owner_compensation
  ADD COLUMN IF NOT EXISTS employee_payroll_tax_pct numeric;

ALTER TABLE public.firm_config
  DROP CONSTRAINT IF EXISTS firm_config_business_structure_chk;

ALTER TABLE public.firm_config
  ALTER COLUMN business_structure DROP NOT NULL,
  ALTER COLUMN business_structure DROP DEFAULT;

ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_business_structure_chk
  CHECK (business_structure IS NULL OR business_structure IN ('sole_prop','s_corp','partnership','c_corp','other'));
