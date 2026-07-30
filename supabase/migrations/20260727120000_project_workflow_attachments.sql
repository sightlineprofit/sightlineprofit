-- Track each SOP attach on a project (supports repeating the same template per period).

CREATE TABLE IF NOT EXISTS public.project_workflow_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  sop_template_id uuid NOT NULL REFERENCES public.sop_templates(id) ON DELETE RESTRICT,
  period_label text,
  period_start date,
  period_end date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_workflow_attachments_project_idx
  ON public.project_workflow_attachments (project_id);
CREATE INDEX IF NOT EXISTS project_workflow_attachments_firm_idx
  ON public.project_workflow_attachments (firm_id);

ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS project_workflow_attachment_id uuid
  REFERENCES public.project_workflow_attachments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_phases_workflow_attachment_idx
  ON public.project_phases (project_workflow_attachment_id)
  WHERE project_workflow_attachment_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_workflow_attachments TO authenticated;

ALTER TABLE public.project_workflow_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_workflow_attachments_select ON public.project_workflow_attachments;
DROP POLICY IF EXISTS project_workflow_attachments_write ON public.project_workflow_attachments;

CREATE POLICY project_workflow_attachments_select
  ON public.project_workflow_attachments
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY project_workflow_attachments_write
  ON public.project_workflow_attachments
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- Backfill: one attachment row per (project, template) for existing template phases.
INSERT INTO public.project_workflow_attachments (project_id, firm_id, sop_template_id, sort_order)
SELECT
  grouped.project_id,
  grouped.firm_id,
  grouped.template_id,
  (ROW_NUMBER() OVER (PARTITION BY grouped.project_id ORDER BY grouped.min_sort) - 1)::integer
FROM (
  SELECT
    pp.project_id,
    p.firm_id,
    sp.template_id,
    MIN(pp.sort_order) AS min_sort
  FROM public.project_phases pp
  JOIN public.projects p ON p.id = pp.project_id
  JOIN public.sop_phases sp ON sp.id = pp.sop_phase_id
  WHERE pp.sop_phase_id IS NOT NULL
  GROUP BY pp.project_id, p.firm_id, sp.template_id
) grouped
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_workflow_attachments pwa
  WHERE pwa.project_id = grouped.project_id
    AND pwa.sop_template_id = grouped.template_id
    AND pwa.period_label IS NULL
    AND pwa.period_start IS NULL
    AND pwa.period_end IS NULL
);

UPDATE public.project_phases pp
SET project_workflow_attachment_id = pwa.id
FROM public.sop_phases sp,
     public.project_workflow_attachments pwa
WHERE pp.sop_phase_id = sp.id
  AND pwa.project_id = pp.project_id
  AND pwa.sop_template_id = sp.template_id
  AND pwa.period_label IS NULL
  AND pwa.period_start IS NULL
  AND pwa.period_end IS NULL
  AND pp.project_workflow_attachment_id IS NULL;
