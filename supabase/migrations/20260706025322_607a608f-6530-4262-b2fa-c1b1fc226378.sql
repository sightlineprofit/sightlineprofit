
-- 1) Create firm_members
CREATE TABLE public.firm_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  role_type text NOT NULL CHECK (role_type IN ('principal','admin','team','contractor','view_only')),
  employment_type text NOT NULL DEFAULT 'employee' CHECK (employment_type IN ('employee','contractor','1099')),
  is_platform_user boolean NOT NULL DEFAULT false,
  invite_sent_at timestamptz,
  invite_accepted_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  -- compensation
  compensation_type text NOT NULL DEFAULT 'hourly' CHECK (compensation_type IN ('hourly','salaried','contract_hourly','contract_annual')),
  hourly_wage numeric,
  annual_base_salary numeric,
  employer_payroll_tax_pct numeric DEFAULT 7.65,
  employer_tax_rate_is_custom boolean NOT NULL DEFAULT false,
  annual_benefits numeric,
  other_annual_costs numeric,
  burdened_hourly_rate numeric,
  burdened_weekly_cost numeric,
  expected_hrs_per_week numeric,
  weeks_per_year numeric DEFAULT 48,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX firm_members_firm_id_idx ON public.firm_members(firm_id);
CREATE INDEX firm_members_profile_id_idx ON public.firm_members(profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_members TO authenticated;
GRANT ALL ON public.firm_members TO service_role;

ALTER TABLE public.firm_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_members_admin_select" ON public.firm_members
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "firm_members_admin_insert" ON public.firm_members
  FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "firm_members_admin_update" ON public.firm_members
  FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "firm_members_admin_delete" ON public.firm_members
  FOR DELETE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- Allow member to read own row (for time entry cost lookup)
CREATE POLICY "firm_members_self_select" ON public.firm_members
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE TRIGGER firm_members_set_updated_at
  BEFORE UPDATE ON public.firm_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Migrate existing non-principal profiles into firm_members
INSERT INTO public.firm_members (
  firm_id, profile_id, name, email, role_type, employment_type,
  is_platform_user, invite_accepted_at, is_active,
  compensation_type, hourly_wage, annual_base_salary,
  employer_payroll_tax_pct, annual_benefits, other_annual_costs,
  burdened_hourly_rate, burdened_weekly_cost,
  expected_hrs_per_week, weeks_per_year
)
SELECT
  p.firm_id,
  p.id,
  COALESCE(NULLIF(p.name,''), p.email),
  p.email,
  CASE p.role::text
    WHEN 'admin' THEN 'admin'
    WHEN 'view_only' THEN 'view_only'
    ELSE 'team'
  END,
  'employee',
  true,
  COALESCE(p.accepted_at, p.created_at),
  true,
  COALESCE(p.compensation_type, 'hourly'),
  p.cost_rate,
  p.annual_base_salary,
  COALESCE(p.employer_payroll_tax_pct, 7.65),
  p.annual_benefits,
  p.other_annual_costs,
  p.burdened_hourly_rate,
  p.burdened_weekly_cost,
  p.expected_hrs_per_week,
  COALESCE(p.weeks_per_year, 48)
FROM public.profiles p
WHERE p.firm_id IS NOT NULL
  AND p.role::text <> 'principal'
  AND NOT EXISTS (
    SELECT 1 FROM public.firm_members fm WHERE fm.profile_id = p.id
  );

-- 3) Drop compensation columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS compensation_type,
  DROP COLUMN IF EXISTS annual_base_salary,
  DROP COLUMN IF EXISTS employer_payroll_tax_pct,
  DROP COLUMN IF EXISTS annual_benefits,
  DROP COLUMN IF EXISTS other_annual_costs,
  DROP COLUMN IF EXISTS burdened_hourly_rate,
  DROP COLUMN IF EXISTS burdened_weekly_cost;
-- Keep cost_rate, expected_hrs_per_week, weeks_per_year on profiles for now
-- (used elsewhere; will be removed in a later cleanup once callers are migrated).
