-- Custom sort order for firm resource library list.

ALTER TABLE public.firm_resources
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY firm_id
      ORDER BY name ASC, created_at ASC, id ASC
    ) - 1 AS rn
  FROM public.firm_resources
  WHERE is_active = true
)
UPDATE public.firm_resources r
SET sort_order = ranked.rn
FROM ranked
WHERE r.id = ranked.id AND r.sort_order IS NULL;

UPDATE public.firm_resources
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE public.firm_resources
  ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.firm_resources
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_firm_resources_firm_sort
  ON public.firm_resources (firm_id, sort_order);
