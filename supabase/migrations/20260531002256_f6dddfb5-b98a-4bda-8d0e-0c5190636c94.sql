-- Phase 1: capacity, accounting basis, project status, advanced compensation

-- Extend firm_config with accounting basis, business structure, and S-Corp comp fields
ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS accounting_basis text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS business_structure text NOT NULL DEFAULT 'sole_prop',
  ADD COLUMN IF NOT EXISTS comp_distribution_annual numeric,
  ADD COLUMN IF NOT EXISTS comp_reserve_target_annual numeric,
  ADD COLUMN IF NOT EXISTS planned_activity_allocation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.firm_config
  DROP CONSTRAINT IF EXISTS firm_config_accounting_basis_chk;
ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_accounting_basis_chk
  CHECK (accounting_basis IN ('cash','accrual'));

ALTER TABLE public.firm_config
  DROP CONSTRAINT IF EXISTS firm_config_business_structure_chk;
ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_business_structure_chk
  CHECK (business_structure IN ('sole_prop','s_corp','other'));

-- Extend project_status enum with new lifecycle values
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'pursuit';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'invoiced';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'collected';
