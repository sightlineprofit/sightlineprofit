-- Allow commitments that appear on the calendar without reducing workload capacity math.

ALTER TABLE public.firm_life_events
  ADD COLUMN IF NOT EXISTS scheduling_only boolean NOT NULL DEFAULT false;
