
ALTER TABLE public.sop_steps
  ADD COLUMN IF NOT EXISTS estimated_hrs numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.project_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_phase_id uuid NOT NULL REFERENCES public.project_phases(id) ON DELETE CASCADE,
  description text NOT NULL,
  estimated_hrs numeric(10,2) NOT NULL DEFAULT 0,
  actual_hrs numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_steps_phase ON public.project_steps(project_phase_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_steps TO authenticated;
GRANT ALL ON public.project_steps TO service_role;

ALTER TABLE public.project_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_steps_select ON public.project_steps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.project_phases ph
    JOIN public.projects p ON p.id = ph.project_id
    WHERE ph.id = project_steps.project_phase_id
      AND p.firm_id = current_firm_id()
  ));

CREATE POLICY project_steps_write ON public.project_steps
  FOR ALL TO authenticated
  USING (is_firm_admin() AND EXISTS (
    SELECT 1 FROM public.project_phases ph
    JOIN public.projects p ON p.id = ph.project_id
    WHERE ph.id = project_steps.project_phase_id
      AND p.firm_id = current_firm_id()
  ))
  WITH CHECK (is_firm_admin() AND EXISTS (
    SELECT 1 FROM public.project_phases ph
    JOIN public.projects p ON p.id = ph.project_id
    WHERE ph.id = project_steps.project_phase_id
      AND p.firm_id = current_firm_id()
  ));
