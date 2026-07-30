-- Retainer pricing: monthly recurring amount × duration in months.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS retainer_monthly_amount numeric,
  ADD COLUMN IF NOT EXISTS retainer_duration_months numeric;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_pricing_method_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_pricing_method_check
  CHECK (pricing_method IN ('flat_fee', 'hourly', 'hybrid', 'retainer'));

COMMENT ON COLUMN public.projects.retainer_monthly_amount IS 'Monthly retainer fee in dollars when pricing_method=retainer.';
COMMENT ON COLUMN public.projects.retainer_duration_months IS 'Retainer term length in months when pricing_method=retainer.';
