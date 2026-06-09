ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS sop_step_id uuid REFERENCES public.sop_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_estimated_hrs numeric(10,2);

-- Backfill template_estimated_hrs for existing rows so override detection works.
UPDATE public.project_steps SET template_estimated_hrs = estimated_hrs
  WHERE template_estimated_hrs IS NULL;