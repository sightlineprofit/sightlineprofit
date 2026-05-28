
-- 1. Alias helper functions matching spec naming
CREATE OR REPLACE FUNCTION public.get_user_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.current_firm_id() $$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.current_user_role() $$;

-- 2. Tier helper + tighten knowledge base visibility
CREATE OR REPLACE FUNCTION public.current_firm_tier()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.subscription_tier::text
  FROM public.firms f
  WHERE f.id = public.current_firm_id()
$$;

DROP POLICY IF EXISTS kbi_read ON public.knowledge_base_items;
CREATE POLICY kbi_read ON public.knowledge_base_items
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    status = 'published'::kb_status
    AND (
      tier_visibility @> ARRAY['all']::text[]
      OR tier_visibility @> ARRAY[coalesce(public.current_firm_tier(), 'foundation')]::text[]
    )
  )
);

-- 3. Over-scope flag on project phases
ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS phase_over_scope boolean NOT NULL DEFAULT false;

UPDATE public.project_phases
SET phase_over_scope = (actual_hrs > expected_hrs)
WHERE phase_over_scope IS DISTINCT FROM (actual_hrs > expected_hrs);

-- 4. Atomic save_time_entry RPC
CREATE OR REPLACE FUNCTION public.save_time_entry(p_entry jsonb)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_firm uuid := public.current_firm_id();
  v_role public.user_role := public.current_user_role();
  v_is_admin boolean := (v_role IN ('principal','admin'));
  v_target_user uuid;
  v_phase_id uuid;
  v_inserted public.time_entries;
  v_total numeric;
  v_expected numeric;
BEGIN
  IF v_uid IS NULL OR v_firm IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_target_user := coalesce((p_entry->>'user_id')::uuid, v_uid);
  IF v_target_user <> v_uid AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not allowed to write time for another user';
  END IF;

  v_phase_id := nullif(p_entry->>'project_phase_id','')::uuid;

  INSERT INTO public.time_entries (
    firm_id, user_id, date, start_time, end_time, hrs, billable, notes,
    project_id, project_phase_id, activity_group_id
  ) VALUES (
    v_firm,
    v_target_user,
    (p_entry->>'date')::date,
    nullif(p_entry->>'start_time','')::time,
    nullif(p_entry->>'end_time','')::time,
    coalesce((p_entry->>'hrs')::numeric, 0),
    coalesce((p_entry->>'billable')::boolean, true),
    nullif(p_entry->>'notes',''),
    nullif(p_entry->>'project_id','')::uuid,
    v_phase_id,
    nullif(p_entry->>'activity_group_id','')::uuid
  )
  RETURNING * INTO v_inserted;

  IF v_phase_id IS NOT NULL THEN
    SELECT coalesce(sum(hrs),0) INTO v_total
      FROM public.time_entries WHERE project_phase_id = v_phase_id;
    SELECT expected_hrs INTO v_expected
      FROM public.project_phases WHERE id = v_phase_id;
    UPDATE public.project_phases
      SET actual_hrs = v_total,
          phase_over_scope = (v_total > coalesce(v_expected,0))
      WHERE id = v_phase_id;
  END IF;

  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.save_time_entry(jsonb) TO authenticated;

-- 5. Realtime publication
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['time_entries','firm_config','expenses','project_phases']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

ALTER TABLE public.time_entries REPLICA IDENTITY FULL;
ALTER TABLE public.firm_config REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.project_phases REPLICA IDENTITY FULL;
