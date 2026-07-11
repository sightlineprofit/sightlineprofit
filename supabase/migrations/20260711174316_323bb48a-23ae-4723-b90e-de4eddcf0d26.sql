
-- 1) Extend projects with explicit pricing method + hybrid split
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS pricing_method text NOT NULL DEFAULT 'flat_fee'
    CHECK (pricing_method IN ('flat_fee','hourly','hybrid')),
  ADD COLUMN IF NOT EXISTS flat_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS hourly_scoped_hours numeric;

-- Backfill pricing_method + flat_fee_amount from legacy columns
UPDATE public.projects
SET pricing_method = CASE
    WHEN COALESCE(fixed_fee,0) > 0 AND COALESCE(scoped_rate,0) > 0 THEN 'hybrid'
    WHEN COALESCE(scoped_rate,0) > 0 AND COALESCE(fixed_fee,0) = 0 THEN 'hourly'
    ELSE 'flat_fee'
  END
WHERE pricing_method = 'flat_fee'; -- only touch untouched (default) rows

UPDATE public.projects
SET flat_fee_amount = fixed_fee
WHERE flat_fee_amount IS NULL AND fixed_fee IS NOT NULL;

-- 2) Locked cost snapshot per project
CREATE TABLE IF NOT EXISTS public.project_cost_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,

  annual_billable_hrs numeric NOT NULL,
  target_margin_pct   numeric NOT NULL,
  weeks_per_year      numeric NOT NULL,

  comp_per_hour   numeric NOT NULL,
  opex_per_hour   numeric NOT NULL,
  team_per_hour   numeric NOT NULL,
  break_even_rate numeric NOT NULL,
  aligned_rate    numeric NOT NULL,
  tax_reserve_pct numeric NOT NULL DEFAULT 0.25,

  total_owner_comp numeric NOT NULL,
  total_opex       numeric NOT NULL,
  total_team_cost  numeric NOT NULL,
  total_cost_floor numeric NOT NULL,

  is_retroactive boolean NOT NULL DEFAULT false,
  snapshotted_at timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.project_cost_snapshots TO authenticated;
GRANT ALL ON public.project_cost_snapshots TO service_role;

ALTER TABLE public.project_cost_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_cost_snapshots_select"
  ON public.project_cost_snapshots
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "project_cost_snapshots_insert"
  ON public.project_cost_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());

CREATE INDEX IF NOT EXISTS project_cost_snapshots_firm_idx
  ON public.project_cost_snapshots(firm_id);
