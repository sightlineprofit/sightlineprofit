-- SOP Library rebuild: extend sop_templates / sop_phases / sop_steps,
-- add firm_resources + resource junctions, extend project snapshot tables.
-- Preserves existing table names and data (sop_templates, sop_steps, project_steps).

-- ─── sop_templates (workflows) ───
ALTER TABLE public.sop_templates
  ADD COLUMN IF NOT EXISTS workflow_type text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS is_active boolean,
  ADD COLUMN IF NOT EXISTS estimated_total_hrs numeric(8,2),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.sop_templates
SET
  workflow_type = COALESCE(workflow_type, 'project'),
  is_active = COALESCE(is_active, deleted_at IS NULL),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE workflow_type IS NULL OR is_active IS NULL OR updated_at IS NULL;

ALTER TABLE public.sop_templates
  ALTER COLUMN workflow_type SET DEFAULT 'project',
  ALTER COLUMN workflow_type SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sop_templates_workflow_type_check'
  ) THEN
    ALTER TABLE public.sop_templates
      ADD CONSTRAINT sop_templates_workflow_type_check
      CHECK (workflow_type IN ('project', 'firm_operation'));
  END IF;
END $$;

-- ─── sop_phases ───
ALTER TABLE public.sop_phases
  ADD COLUMN IF NOT EXISTS estimated_hrs numeric(8,2);

UPDATE public.sop_phases
SET estimated_hrs = COALESCE(estimated_hrs, expected_hrs, 0)
WHERE estimated_hrs IS NULL;

-- ─── sop_steps (tasks) ───
ALTER TABLE public.sop_steps
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS assigned_role text,
  ADD COLUMN IF NOT EXISTS trigger_description text,
  ADD COLUMN IF NOT EXISTS completion_criteria text,
  ADD COLUMN IF NOT EXISTS steps jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_billable boolean,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.sop_steps
SET
  name = COALESCE(NULLIF(trim(name), ''), NULLIF(trim(description), ''), 'Untitled task'),
  assigned_role = COALESCE(assigned_role, 'principal'),
  is_billable = COALESCE(is_billable, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE name IS NULL
   OR assigned_role IS NULL
   OR is_billable IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.sop_steps
  ALTER COLUMN assigned_role SET DEFAULT 'principal',
  ALTER COLUMN assigned_role SET NOT NULL,
  ALTER COLUMN is_billable SET DEFAULT true,
  ALTER COLUMN is_billable SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sop_steps_assigned_role_check'
  ) THEN
    ALTER TABLE public.sop_steps
      ADD CONSTRAINT sop_steps_assigned_role_check
      CHECK (assigned_role IN (
        'principal',
        'designer',
        'junior_designer',
        'coordinator',
        'administrative',
        'external'
      ));
  END IF;
END $$;

-- ─── project_phases ───
ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS estimated_hrs numeric(8,2);

UPDATE public.project_phases pp
SET
  firm_id = p.firm_id,
  estimated_hrs = COALESCE(pp.estimated_hrs, pp.expected_hrs, 0)
FROM public.projects p
WHERE p.id = pp.project_id
  AND (pp.firm_id IS NULL OR pp.estimated_hrs IS NULL);

-- ─── project_steps ───
ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS assigned_role text,
  ADD COLUMN IF NOT EXISTS trigger_description text,
  ADD COLUMN IF NOT EXISTS completion_criteria text,
  ADD COLUMN IF NOT EXISTS steps jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_billable boolean,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.project_steps ps
SET
  project_id = ph.project_id,
  firm_id = p.firm_id,
  name = COALESCE(NULLIF(trim(ps.name), ''), NULLIF(trim(ps.description), ''), 'Untitled task'),
  assigned_role = COALESCE(ps.assigned_role, 'principal'),
  is_billable = COALESCE(ps.is_billable, true),
  updated_at = COALESCE(ps.updated_at, ps.created_at, now())
FROM public.project_phases ph
JOIN public.projects p ON p.id = ph.project_id
WHERE ps.project_phase_id = ph.id
  AND (
    ps.project_id IS NULL
    OR ps.firm_id IS NULL
    OR ps.name IS NULL
    OR ps.assigned_role IS NULL
    OR ps.is_billable IS NULL
    OR ps.updated_at IS NULL
  );

ALTER TABLE public.project_steps
  ALTER COLUMN assigned_role SET DEFAULT 'principal',
  ALTER COLUMN is_billable SET DEFAULT true,
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_steps_assigned_role_check'
  ) THEN
    ALTER TABLE public.project_steps
      ADD CONSTRAINT project_steps_assigned_role_check
      CHECK (assigned_role IS NULL OR assigned_role IN (
        'principal',
        'designer',
        'junior_designer',
        'coordinator',
        'administrative',
        'external'
      ));
  END IF;
END $$;

-- ─── firm_resources ───
CREATE TABLE IF NOT EXISTS public.firm_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  resource_type text NOT NULL
    CHECK (resource_type IN (
      'email_template',
      'document_template',
      'process_doc',
      'video',
      'external_link',
      'contract',
      'checklist',
      'other'
    )),
  url text,
  content text,
  subject_line text,
  tags text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firm_resources_firm_idx ON public.firm_resources (firm_id);
CREATE INDEX IF NOT EXISTS firm_resources_type_idx ON public.firm_resources (firm_id, resource_type);

-- ─── sop_step_resources (template task ↔ resource) ───
CREATE TABLE IF NOT EXISTS public.sop_step_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_step_id uuid NOT NULL REFERENCES public.sop_steps(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.firm_resources(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sop_step_resources_step_resource_key UNIQUE (sop_step_id, resource_id)
);

CREATE INDEX IF NOT EXISTS sop_step_resources_step_idx ON public.sop_step_resources (sop_step_id);
CREATE INDEX IF NOT EXISTS sop_step_resources_firm_idx ON public.sop_step_resources (firm_id);

-- ─── project_step_resources (project task ↔ resource) ───
CREATE TABLE IF NOT EXISTS public.project_step_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_step_id uuid NOT NULL REFERENCES public.project_steps(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.firm_resources(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_step_resources_step_resource_key UNIQUE (project_step_id, resource_id)
);

CREATE INDEX IF NOT EXISTS project_step_resources_step_idx ON public.project_step_resources (project_step_id);
CREATE INDEX IF NOT EXISTS project_step_resources_firm_idx ON public.project_step_resources (firm_id);

-- ─── RLS: firm_resources ───
ALTER TABLE public.firm_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firm_resources_select ON public.firm_resources;
CREATE POLICY firm_resources_select ON public.firm_resources
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

DROP POLICY IF EXISTS firm_resources_write ON public.firm_resources;
CREATE POLICY firm_resources_write ON public.firm_resources
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- ─── RLS: sop_step_resources ───
ALTER TABLE public.sop_step_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sop_step_resources_select ON public.sop_step_resources;
CREATE POLICY sop_step_resources_select ON public.sop_step_resources
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

DROP POLICY IF EXISTS sop_step_resources_write ON public.sop_step_resources;
CREATE POLICY sop_step_resources_write ON public.sop_step_resources
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- ─── RLS: project_step_resources ───
ALTER TABLE public.project_step_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_step_resources_select ON public.project_step_resources;
CREATE POLICY project_step_resources_select ON public.project_step_resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_steps ps
      JOIN public.projects p ON p.id = ps.project_id
      WHERE ps.id = project_step_id AND p.firm_id = public.current_firm_id()
    )
  );

DROP POLICY IF EXISTS project_step_resources_write ON public.project_step_resources;
CREATE POLICY project_step_resources_write ON public.project_step_resources
  FOR ALL TO authenticated
  USING (
    public.is_firm_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_steps ps
      JOIN public.projects p ON p.id = ps.project_id
      WHERE ps.id = project_step_id AND p.firm_id = public.current_firm_id()
    )
  )
  WITH CHECK (
    public.is_firm_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_steps ps
      JOIN public.projects p ON p.id = ps.project_id
      WHERE ps.id = project_step_id AND p.firm_id = public.current_firm_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_resources TO authenticated;
GRANT ALL ON public.firm_resources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_step_resources TO authenticated;
GRANT ALL ON public.sop_step_resources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_step_resources TO authenticated;
GRANT ALL ON public.project_step_resources TO service_role;

-- ─── Maintain estimated hrs rollups ───
CREATE OR REPLACE FUNCTION public.refresh_sop_phase_estimated_hrs(p_phase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hrs numeric(8,2);
BEGIN
  SELECT COALESCE(SUM(COALESCE(estimated_hrs, 0)), 0)
  INTO v_hrs
  FROM public.sop_steps
  WHERE phase_id = p_phase_id;

  UPDATE public.sop_phases
  SET
    estimated_hrs = v_hrs,
    expected_hrs = v_hrs
  WHERE id = p_phase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_sop_template_estimated_hrs(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hrs numeric(8,2);
BEGIN
  SELECT COALESCE(SUM(COALESCE(ss.estimated_hrs, 0)), 0)
  INTO v_hrs
  FROM public.sop_steps ss
  JOIN public.sop_phases sp ON sp.id = ss.phase_id
  WHERE sp.template_id = p_template_id;

  UPDATE public.sop_templates
  SET
    estimated_total_hrs = v_hrs,
    updated_at = now()
  WHERE id = p_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_sop_phase_from_step()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase_id uuid;
  v_template_id uuid;
BEGIN
  v_phase_id := COALESCE(NEW.phase_id, OLD.phase_id);
  IF v_phase_id IS NOT NULL THEN
    PERFORM public.refresh_sop_phase_estimated_hrs(v_phase_id);
    SELECT template_id INTO v_template_id FROM public.sop_phases WHERE id = v_phase_id;
    IF v_template_id IS NOT NULL THEN
      PERFORM public.refresh_sop_template_estimated_hrs(v_template_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sop_steps_refresh_rollups ON public.sop_steps;
CREATE TRIGGER sop_steps_refresh_rollups
  AFTER INSERT OR UPDATE OF estimated_hrs, phase_id OR DELETE ON public.sop_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_sop_phase_from_step();

-- Backfill rollups for existing templates
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.sop_phases LOOP
    PERFORM public.refresh_sop_phase_estimated_hrs(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.sop_templates WHERE deleted_at IS NULL LOOP
    PERFORM public.refresh_sop_template_estimated_hrs(r.id);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.refresh_sop_phase_estimated_hrs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sop_template_estimated_hrs(uuid) TO authenticated;
