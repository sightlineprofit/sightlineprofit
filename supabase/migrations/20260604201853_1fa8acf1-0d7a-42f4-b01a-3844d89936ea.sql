
ALTER TABLE public.pipeline_projects
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS billing_type text CHECK (billing_type IN ('fixed','hourly')),
  ADD COLUMN IF NOT EXISTS fixed_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS scoped_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS estimated_end date,
  ADD COLUMN IF NOT EXISTS sop_template_id uuid REFERENCES public.sop_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;
