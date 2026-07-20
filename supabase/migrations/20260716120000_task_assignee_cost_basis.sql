-- Task-level assignees for project-specific and SOP-template cost basis.

-- ─── SOP step assignees (template library) ───
CREATE TABLE IF NOT EXISTS public.sop_step_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_step_id uuid NOT NULL REFERENCES public.sop_steps(id) ON DELETE CASCADE,
  assignee_kind text NOT NULL DEFAULT 'member'
    CHECK (assignee_kind IN ('member', 'principal')),
  firm_member_id uuid REFERENCES public.firm_members(id) ON DELETE CASCADE,
  estimated_hrs numeric(6,2) NOT NULL DEFAULT 0,
  is_billable boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sop_step_assignees_member_check CHECK (
    (assignee_kind = 'principal' AND firm_member_id IS NULL)
    OR (assignee_kind = 'member' AND firm_member_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sop_step_assignees_member_uq
  ON public.sop_step_assignees (sop_step_id, firm_member_id)
  WHERE assignee_kind = 'member';

CREATE UNIQUE INDEX IF NOT EXISTS sop_step_assignees_principal_uq
  ON public.sop_step_assignees (sop_step_id)
  WHERE assignee_kind = 'principal';

CREATE INDEX IF NOT EXISTS sop_step_assignees_step_idx
  ON public.sop_step_assignees (sop_step_id);

-- ─── Project step assignees (live project scope) ───
CREATE TABLE IF NOT EXISTS public.project_step_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_step_id uuid NOT NULL REFERENCES public.project_steps(id) ON DELETE CASCADE,
  assignee_kind text NOT NULL DEFAULT 'member'
    CHECK (assignee_kind IN ('member', 'principal')),
  firm_member_id uuid REFERENCES public.firm_members(id) ON DELETE CASCADE,
  estimated_hrs numeric(6,2) NOT NULL DEFAULT 0,
  is_billable boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_step_assignees_member_check CHECK (
    (assignee_kind = 'principal' AND firm_member_id IS NULL)
    OR (assignee_kind = 'member' AND firm_member_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_step_assignees_member_uq
  ON public.project_step_assignees (project_step_id, firm_member_id)
  WHERE assignee_kind = 'member';

CREATE UNIQUE INDEX IF NOT EXISTS project_step_assignees_principal_uq
  ON public.project_step_assignees (project_step_id)
  WHERE assignee_kind = 'principal';

CREATE INDEX IF NOT EXISTS project_step_assignees_step_idx
  ON public.project_step_assignees (project_step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_step_assignees TO authenticated;
GRANT ALL ON public.sop_step_assignees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_step_assignees TO authenticated;
GRANT ALL ON public.project_step_assignees TO service_role;

ALTER TABLE public.sop_step_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_step_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY sop_step_assignees_select ON public.sop_step_assignees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sop_steps ss
      JOIN public.sop_phases sp ON sp.id = ss.phase_id
      WHERE ss.id = sop_step_id AND sp.firm_id = public.current_firm_id()
    )
  );

CREATE POLICY sop_step_assignees_write ON public.sop_step_assignees
  FOR ALL TO authenticated
  USING (
    public.is_firm_admin()
    AND EXISTS (
      SELECT 1 FROM public.sop_steps ss
      JOIN public.sop_phases sp ON sp.id = ss.phase_id
      WHERE ss.id = sop_step_id AND sp.firm_id = public.current_firm_id()
    )
  )
  WITH CHECK (
    public.is_firm_admin()
    AND EXISTS (
      SELECT 1 FROM public.sop_steps ss
      JOIN public.sop_phases sp ON sp.id = ss.phase_id
      WHERE ss.id = sop_step_id AND sp.firm_id = public.current_firm_id()
    )
  );

CREATE POLICY project_step_assignees_select ON public.project_step_assignees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_steps ps
      JOIN public.project_phases ph ON ph.id = ps.project_phase_id
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ps.id = project_step_id AND p.firm_id = public.current_firm_id()
    )
  );

CREATE POLICY project_step_assignees_write ON public.project_step_assignees
  FOR ALL TO authenticated
  USING (
    public.is_firm_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_steps ps
      JOIN public.project_phases ph ON ph.id = ps.project_phase_id
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ps.id = project_step_id AND p.firm_id = public.current_firm_id()
    )
  )
  WITH CHECK (
    public.is_firm_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_steps ps
      JOIN public.project_phases ph ON ph.id = ps.project_phase_id
      JOIN public.projects p ON p.id = ph.project_id
      WHERE ps.id = project_step_id AND p.firm_id = public.current_firm_id()
    )
  );

-- ─── Snapshot extensions for task-assignee cost basis ───
ALTER TABLE public.project_cost_snapshots
  ADD COLUMN IF NOT EXISTS cost_basis_method text NOT NULL DEFAULT 'firm_average'
    CHECK (cost_basis_method IN ('firm_average', 'task_assignee'));

ALTER TABLE public.project_cost_snapshots
  ADD COLUMN IF NOT EXISTS assignee_cost_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.project_cost_snapshots
  ADD COLUMN IF NOT EXISTS project_break_even_rate numeric(10,4);

-- opex_per_hour already exists on project_cost_snapshots from original migration.

-- Realtime (for live UI refresh when assignees change)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_step_assignees', 'sop_step_assignees', 'project_cost_snapshots']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

ALTER TABLE public.project_step_assignees REPLICA IDENTITY FULL;
ALTER TABLE public.sop_step_assignees REPLICA IDENTITY FULL;
ALTER TABLE public.project_cost_snapshots REPLICA IDENTITY FULL;
