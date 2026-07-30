-- Server-only profile↔firm linking (bypasses prevent_profile_privilege_escalation safely).
-- Only sets firm_id when currently NULL; never reassigns an existing firm.

CREATE OR REPLACE FUNCTION public.link_profile_to_firm_if_null(
  p_user_id uuid,
  p_firm_id uuid,
  p_role public.user_role DEFAULT 'principal',
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_linked uuid;
BEGIN
  SELECT firm_id INTO v_existing
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  UPDATE public.profiles
  SET
    firm_id = p_firm_id,
    role = p_role,
    name = coalesce(nullif(trim(p_name), ''), name),
    accepted_at = coalesce(accepted_at, now())
  WHERE id = p_user_id
    AND firm_id IS NULL
  RETURNING firm_id INTO v_linked;

  IF v_linked IS NULL THEN
    SELECT firm_id INTO v_existing FROM public.profiles WHERE id = p_user_id;
    RETURN v_existing;
  END IF;

  RETURN v_linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_profile_to_firm_if_null(uuid, uuid, public.user_role, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_profile_to_firm_if_null(uuid, uuid, public.user_role, text) TO service_role;
