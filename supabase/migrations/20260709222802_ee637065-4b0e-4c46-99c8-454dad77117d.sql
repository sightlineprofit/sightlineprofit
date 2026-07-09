
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS est_weekly_hrs numeric;

CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  label text NOT NULL,
  milestone_date date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_milestones_project_idx
  ON public.project_milestones(project_id);
CREATE INDEX IF NOT EXISTS project_milestones_firm_idx
  ON public.project_milestones(firm_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT ALL ON public.project_milestones TO service_role;

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_milestones_select ON public.project_milestones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p
            WHERE p.id = project_milestones.project_id
              AND p.firm_id = public.current_firm_id())
  );

CREATE POLICY project_milestones_write ON public.project_milestones
  FOR ALL USING (
    public.is_firm_admin() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id
        AND p.firm_id = public.current_firm_id()
    )
  ) WITH CHECK (
    public.is_firm_admin() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id
        AND p.firm_id = public.current_firm_id()
    )
  );

CREATE TRIGGER project_milestones_set_updated_at
  BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
