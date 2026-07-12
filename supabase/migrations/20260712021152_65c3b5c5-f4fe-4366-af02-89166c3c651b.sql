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

  -- is_super_admin can never be changed via the API by non-super-admins
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'is_super_admin cannot be changed via the API';
  END IF;

  -- firm_id: allow initial assignment (NULL -> value); block any other change
  IF NEW.firm_id IS DISTINCT FROM OLD.firm_id AND OLD.firm_id IS NOT NULL THEN
    RAISE EXCEPTION 'firm_id cannot be changed via the API';
  END IF;

  -- role: allow initial assignment (NULL -> value); block any other change
  IF NEW.role IS DISTINCT FROM OLD.role AND OLD.role IS NOT NULL THEN
    RAISE EXCEPTION 'role cannot be changed via the API';
  END IF;

  RETURN NEW;
END $$;