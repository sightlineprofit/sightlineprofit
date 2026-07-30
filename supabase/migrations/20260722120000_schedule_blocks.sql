-- Schedule blocks: extend firm_life_events + schedule_exceptions.

ALTER TABLE public.firm_life_events
  ADD COLUMN IF NOT EXISTS block_type text NOT NULL DEFAULT 'life_event';

ALTER TABLE public.firm_life_events
  DROP CONSTRAINT IF EXISTS firm_life_events_block_type_check;

ALTER TABLE public.firm_life_events
  ADD CONSTRAINT firm_life_events_block_type_check
  CHECK (block_type IN (
    'life_event',
    'recurring_season',
    'recurring_weekly',
    'blackout_date'
  ));

ALTER TABLE public.firm_life_events
  ADD COLUMN IF NOT EXISTS recurs_annually boolean NOT NULL DEFAULT false;

ALTER TABLE public.firm_life_events
  ADD COLUMN IF NOT EXISTS default_capacity_pct integer
  CHECK (default_capacity_pct IS NULL OR (
    default_capacity_pct >= 0 AND default_capacity_pct <= 100
  ));

ALTER TABLE public.firm_life_events
  ADD COLUMN IF NOT EXISTS weekly_hours_blocked numeric;

-- Backfill: existing recurring life events
UPDATE public.firm_life_events
SET recurs_annually = is_recurring
WHERE recurs_annually = false AND is_recurring = true;

UPDATE public.firm_life_events
SET default_capacity_pct = capacity_pct
WHERE block_type = 'recurring_season' AND default_capacity_pct IS NULL;

CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  life_event_id uuid NOT NULL REFERENCES public.firm_life_events(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  capacity_pct integer NOT NULL CHECK (capacity_pct >= 0 AND capacity_pct <= 100),
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (life_event_id, week_start)
);

CREATE INDEX IF NOT EXISTS schedule_exceptions_firm_idx
  ON public.schedule_exceptions (firm_id);

CREATE INDEX IF NOT EXISTS schedule_exceptions_event_week_idx
  ON public.schedule_exceptions (life_event_id, week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated;
GRANT ALL ON public.schedule_exceptions TO service_role;

ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_exceptions_select"
  ON public.schedule_exceptions FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "schedule_exceptions_insert"
  ON public.schedule_exceptions FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "schedule_exceptions_update"
  ON public.schedule_exceptions FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id())
  WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "schedule_exceptions_delete"
  ON public.schedule_exceptions FOR DELETE TO authenticated
  USING (firm_id = public.current_firm_id());

ALTER TABLE public.firm_config
  ADD COLUMN IF NOT EXISTS capacity_blocks_onboarded boolean NOT NULL DEFAULT false;
