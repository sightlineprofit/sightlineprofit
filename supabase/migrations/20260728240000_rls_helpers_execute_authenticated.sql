-- RLS policies reference these SECURITY DEFINER helpers (e.g. profiles_select_own uses
-- is_super_admin()). Authenticated sessions must be able to invoke them during policy
-- evaluation. REVOKE blocks direct PostgREST RPC abuse but breaks SELECT for many users.

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_firm_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_firm_principal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

COMMENT ON FUNCTION public.is_super_admin() IS
  'RLS helper — EXECUTE granted to authenticated for policy evaluation only; do not expose as public RPC.';
