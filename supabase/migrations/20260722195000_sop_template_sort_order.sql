-- Custom sort order for SOP workflows within each firm + workflow_type tab.

ALTER TABLE public.sop_templates
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY firm_id, workflow_type
      ORDER BY created_at ASC, id ASC
    ) - 1 AS rn
  FROM public.sop_templates
  WHERE deleted_at IS NULL
)
UPDATE public.sop_templates t
SET sort_order = r.rn
FROM ranked r
WHERE t.id = r.id AND t.sort_order IS NULL;

UPDATE public.sop_templates
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE public.sop_templates
  ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.sop_templates
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sop_templates_firm_type_sort
  ON public.sop_templates (firm_id, workflow_type, sort_order);
