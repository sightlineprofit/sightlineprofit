-- Capacity Planner Phase A: life events + firm_config capacity fields.

CREATE TABLE IF NOT EXISTS public.firm_life_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'maternity_paternity_leave',
    'medical_leave',
    'vacation',
    'sabbatical',
    'seasonal_slowdown',
    'personal',
    'other'
  )),
  start_date date NOT NULL,
  end_date date NOT NULL,
  capacity_pct integer NOT NULL DEFAULT 0 CHECK (capacity_pct >= 0 AND capacity_pct <= 100),
  notes text,
  is_recurring boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_life_events_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS firm_life_events_firm_dates_idx
  ON public.firm_life_events (firm_id, start_date, end_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_life_events TO authenticated;
GRANT ALL ON public.firm_life_events TO service_role;

ALTER TABLE public.firm_life_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_life_events_select"
  ON public.firm_life_events FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "firm_life_events_insert"
  ON public.firm_life_events FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "firm_life_events_update"
  ON public.firm_life_events FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id())
  WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "firm_life_events_delete"
  ON public.firm_life_events FOR DELETE TO authenticated
  USING (firm_id = public.current_firm_id());

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS capacity_ceiling_hrs_per_week numeric;

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS accepting_new_clients boolean NOT NULL DEFAULT true;

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS accepting_new_clients_until date;

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS capacity_view_horizon text NOT NULL DEFAULT '12_months';

ALTER TABLE public.firm_config
  DROP CONSTRAINT IF EXISTS firm_config_capacity_view_horizon_check;

ALTER TABLE public.firm_config
  ADD CONSTRAINT firm_config_capacity_view_horizon_check
  CHECK (capacity_view_horizon IN ('16_weeks', '12_months'));

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS maternity_leave_savings_per_month numeric;
