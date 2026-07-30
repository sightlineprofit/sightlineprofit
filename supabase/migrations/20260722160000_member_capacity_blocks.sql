-- Per-member capacity blocks: team members manage their own life events / commitments.

ALTER TABLE public.firm_life_events
  ADD COLUMN IF NOT EXISTS firm_member_id uuid REFERENCES public.firm_members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS firm_life_events_member_idx
  ON public.firm_life_events (firm_id, firm_member_id)
  WHERE firm_member_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_firm_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fm.id
  FROM public.firm_members fm
  WHERE fm.profile_id = auth.uid()
    AND fm.firm_id = public.current_firm_id()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_firm_member_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_firm_member_id() TO authenticated;

DROP POLICY IF EXISTS "firm_life_events_select" ON public.firm_life_events;
DROP POLICY IF EXISTS "firm_life_events_insert" ON public.firm_life_events;
DROP POLICY IF EXISTS "firm_life_events_update" ON public.firm_life_events;
DROP POLICY IF EXISTS "firm_life_events_delete" ON public.firm_life_events;

CREATE POLICY "firm_life_events_select"
  ON public.firm_life_events FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR firm_member_id = public.current_firm_member_id()
    )
  );

CREATE POLICY "firm_life_events_insert"
  ON public.firm_life_events FOR INSERT TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR (
        firm_member_id IS NOT NULL
        AND firm_member_id = public.current_firm_member_id()
      )
    )
  );

CREATE POLICY "firm_life_events_update"
  ON public.firm_life_events FOR UPDATE TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR firm_member_id = public.current_firm_member_id()
    )
  )
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR (
        firm_member_id IS NOT NULL
        AND firm_member_id = public.current_firm_member_id()
      )
    )
  );

CREATE POLICY "firm_life_events_delete"
  ON public.firm_life_events FOR DELETE TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR firm_member_id = public.current_firm_member_id()
    )
  );

-- Schedule exceptions: team may only manage exceptions tied to their own blocks.
DROP POLICY IF EXISTS "schedule_exceptions_select" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "schedule_exceptions_insert" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "schedule_exceptions_update" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "schedule_exceptions_delete" ON public.schedule_exceptions;

CREATE POLICY "schedule_exceptions_select"
  ON public.schedule_exceptions FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR EXISTS (
        SELECT 1 FROM public.firm_life_events fle
        WHERE fle.id = life_event_id
          AND fle.firm_member_id = public.current_firm_member_id()
      )
    )
  );

CREATE POLICY "schedule_exceptions_insert"
  ON public.schedule_exceptions FOR INSERT TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR EXISTS (
        SELECT 1 FROM public.firm_life_events fle
        WHERE fle.id = life_event_id
          AND fle.firm_member_id = public.current_firm_member_id()
      )
    )
  );

CREATE POLICY "schedule_exceptions_update"
  ON public.schedule_exceptions FOR UPDATE TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR EXISTS (
        SELECT 1 FROM public.firm_life_events fle
        WHERE fle.id = life_event_id
          AND fle.firm_member_id = public.current_firm_member_id()
      )
    )
  )
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR EXISTS (
        SELECT 1 FROM public.firm_life_events fle
        WHERE fle.id = life_event_id
          AND fle.firm_member_id = public.current_firm_member_id()
      )
    )
  );

CREATE POLICY "schedule_exceptions_delete"
  ON public.schedule_exceptions FOR DELETE TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_firm_admin()
      OR EXISTS (
        SELECT 1 FROM public.firm_life_events fle
        WHERE fle.id = life_event_id
          AND fle.firm_member_id = public.current_firm_member_id()
      )
    )
  );
