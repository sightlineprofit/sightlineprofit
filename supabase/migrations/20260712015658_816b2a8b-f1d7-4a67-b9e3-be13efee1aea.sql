
-- 1) Prevent privilege escalation on profiles via a trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'role, is_super_admin, and firm_id cannot be changed via the API';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Tighten owner_compensation SELECT to principals/admins only
DROP POLICY IF EXISTS owner_comp_select ON public.owner_compensation;
CREATE POLICY owner_comp_select ON public.owner_compensation
FOR SELECT
USING (
  firm_id = public.current_firm_id()
  AND (public.is_firm_admin() OR public.is_firm_principal())
);

-- 3) Lock down SECURITY DEFINER function EXECUTE grants
REVOKE EXECUTE ON FUNCTION public.save_time_entry(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_firm_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_firm_tier() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_firm_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_firm_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_firm_principal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.founding_slots_remaining() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_firm_internal_project(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_firm_activity_types(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_firm_billing_from_backend(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_activity_types_on_firm_insert() FROM PUBLIC;

-- Grant EXECUTE to authenticated for functions used by app / RLS policy evaluation
GRANT EXECUTE ON FUNCTION public.save_time_entry(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_firm_tier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_firm_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_firm_principal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founding_slots_remaining() TO anon, authenticated;

-- Server-only / admin functions: only service_role
GRANT EXECUTE ON FUNCTION public.ensure_firm_internal_project(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_firm_activity_types(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_firm_billing_from_backend(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
