-- Phase 2: project_assignments (firm_members-based) + task completion

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.current_firm_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fm.id
  FROM public.firm_members fm
  WHERE fm.firm_id = public.current_firm_id()
    AND fm.profile_id = auth.uid()
    AND fm.is_active = true
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_firm_member_id() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_assignments'
      AND column_name = 'user_id'
  ) THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS pa_select ON public.project_assignments;
  DROP POLICY IF EXISTS pa_write ON public.project_assignments;

  ALTER TABLE public.project_assignments RENAME TO project_assignments_legacy;

  CREATE TABLE public.project_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    assignee_id uuid NOT NULL REFERENCES public.firm_members(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    role_on_project text,
    CONSTRAINT project_assignments_project_assignee_key UNIQUE (project_id, assignee_id)
  );

  CREATE INDEX project_assignments_firm_idx ON public.project_assignments(firm_id);
  CREATE INDEX project_assignments_assignee_idx ON public.project_assignments(assignee_id);
  CREATE INDEX project_assignments_project_idx ON public.project_assignments(project_id);

  INSERT INTO public.project_assignments (project_id, firm_id, assignee_id, assigned_by, assigned_at)
  SELECT pa.project_id, p.firm_id, fm.id, pa.user_id, now()
  FROM public.project_assignments_legacy pa
  JOIN public.projects p ON p.id = pa.project_id
  JOIN public.firm_members fm ON fm.profile_id = pa.user_id AND fm.firm_id = p.firm_id
  ON CONFLICT (project_id, assignee_id) DO NOTHING;

  DROP TABLE public.project_assignments_legacy;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_assignments TO authenticated;

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pa_select ON public.project_assignments;
DROP POLICY IF EXISTS pa_write ON public.project_assignments;
DROP POLICY IF EXISTS project_assignments_select_admin ON public.project_assignments;
DROP POLICY IF EXISTS project_assignments_select_own ON public.project_assignments;
DROP POLICY IF EXISTS project_assignments_write_admin ON public.project_assignments;

CREATE POLICY project_assignments_select_admin
  ON public.project_assignments
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY project_assignments_select_own
  ON public.project_assignments
  FOR SELECT TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND assignee_id = public.current_firm_member_id()
  );

CREATE POLICY project_assignments_write_admin
  ON public.project_assignments
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
