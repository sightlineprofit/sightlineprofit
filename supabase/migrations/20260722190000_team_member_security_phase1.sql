-- Phase 1: team / view_only financial isolation and role enforcement (RLS)

-- ============ project_cost_snapshots: principal + admin only ============
DROP POLICY IF EXISTS "project_cost_snapshots_select" ON public.project_cost_snapshots;
DROP POLICY IF EXISTS "project_cost_snapshots_insert" ON public.project_cost_snapshots;

CREATE POLICY "snapshots_principal_admin_only"
  ON public.project_cost_snapshots
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
  );

CREATE POLICY "snapshots_insert_principal_admin_only"
  ON public.project_cost_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
  );

-- ============ owner_compensation: principal only (SELECT) ============
-- owner_draws RLS is in 20260722190100_owner_draws_rls_principal_only.sql
-- (run after 20260721120000_owner_pay_payment_tracking.sql if you use owner draws)
DROP POLICY IF EXISTS owner_comp_select ON public.owner_compensation;

CREATE POLICY owner_comp_select
  ON public.owner_compensation
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND public.is_firm_principal()
  );

-- ============ expenses (operating_expenses): principal + admin only ============
DROP POLICY IF EXISTS expenses_select ON public.expenses;

CREATE POLICY expenses_select_principal_admin
  ON public.expenses
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
  );

-- ============ aligned_rate_history: principal + admin only ============
DROP POLICY IF EXISTS "Firm members read rate history" ON public.aligned_rate_history;

CREATE POLICY aligned_rate_history_select_principal_admin
  ON public.aligned_rate_history
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
  );

-- ============ firm_config: full table principal + admin; team-safe view ============
DROP POLICY IF EXISTS firm_config_select ON public.firm_config;

CREATE POLICY firm_config_select_financial
  ON public.firm_config
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
  );

CREATE OR REPLACE VIEW public.firm_config_team_safe AS
SELECT
  fc.firm_id,
  fc.target_billable_hrs_per_week,
  fc.capacity_view_horizon,
  fc.capacity_blocks_onboarded,
  fc.accepting_new_clients,
  fc.accepting_new_clients_until
FROM public.firm_config fc
WHERE fc.firm_id = public.current_firm_id();

GRANT SELECT ON public.firm_config_team_safe TO authenticated;

-- ============ time_entries: own rows for team/view_only; all firm for principal/admin ============
DROP POLICY IF EXISTS time_entries_select ON public.time_entries;
DROP POLICY IF EXISTS time_entries_insert ON public.time_entries;

CREATE POLICY time_entries_select_own
  ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND user_id = auth.uid()
  );

CREATE POLICY time_entries_select_admin
  ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
  );

CREATE POLICY time_entries_insert_own
  ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR (
        user_id = auth.uid()
        AND public.current_user_role() IS DISTINCT FROM 'view_only'
      )
    )
  );
