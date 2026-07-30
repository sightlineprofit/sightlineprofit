-- Trusted profile updates (service role, server bootstrap) must bypass firm_id/role locks.
-- New Supabase secret keys may not set request.jwt.claim.role; also check auth.role() / JWT.

CREATE OR REPLACE FUNCTION public.profile_update_is_trusted()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    current_user IN ('service_role', 'postgres', 'supabase_admin')
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR coalesce(auth.role(), '') = 'service_role'
    OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.is_super_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.profile_update_is_trusted() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF public.profile_update_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'is_super_admin cannot be changed via the API';
  END IF;

  IF NEW.firm_id IS DISTINCT FROM OLD.firm_id AND OLD.firm_id IS NOT NULL THEN
    RAISE EXCEPTION 'firm_id cannot be changed via the API';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND OLD.role IS NOT NULL THEN
    RAISE EXCEPTION 'role cannot be changed via the API';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
