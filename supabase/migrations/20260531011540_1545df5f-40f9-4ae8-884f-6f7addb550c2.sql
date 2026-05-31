-- Part 1: reserve mode
ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS comp_reserve_mode text NOT NULL DEFAULT 'custom';

-- Part 2: burdened cost columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS compensation_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS annual_base_salary numeric,
  ADD COLUMN IF NOT EXISTS employer_payroll_tax_pct numeric DEFAULT 7.65,
  ADD COLUMN IF NOT EXISTS annual_benefits numeric,
  ADD COLUMN IF NOT EXISTS other_annual_costs numeric,
  ADD COLUMN IF NOT EXISTS burdened_hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS burdened_weekly_cost numeric;