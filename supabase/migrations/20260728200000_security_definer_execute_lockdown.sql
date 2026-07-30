-- Supabase linter: "Signed-In Users Can Execute SECURITY DEFINER Function"
-- Trigger/internal helpers must not be callable via PostgREST RPC.
-- RLS policy helpers remain SECURITY DEFINER but need not be EXECUTE-granted to clients
-- (PostgreSQL evaluates SECURITY DEFINER functions in policies with owner privileges).

-- ─── Revoke direct RPC access (keep service_role for server-side calls) ───
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_firm_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_firm_principal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_activity_types_on_firm_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_time_entry_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_firm_config_team_safe_from_config() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_sop_phase_from_step() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.save_time_entry(jsonb) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_sop_phase_estimated_hrs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_sop_template_estimated_hrs(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_sop_phase_estimated_hrs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_sop_template_estimated_hrs(uuid) TO service_role;

-- Also lock down other SECURITY DEFINER helpers that were re-granted to authenticated elsewhere.
REVOKE EXECUTE ON FUNCTION public.current_firm_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_firm_tier() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_firm_id() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.refresh_sop_template_estimated_hrs(uuid) IS
  'Server/trigger only — call via service_role or sop_steps trigger; not exposed to authenticated RPC.';
