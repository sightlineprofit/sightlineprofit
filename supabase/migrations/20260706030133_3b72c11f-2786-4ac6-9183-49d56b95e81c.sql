
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS cost_rate_at_time numeric;

CREATE OR REPLACE FUNCTION public.stamp_time_entry_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF NEW.cost_rate_at_time IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT burdened_hourly_rate INTO v_rate
    FROM public.firm_members
   WHERE firm_id = NEW.firm_id
     AND profile_id = NEW.user_id
     AND is_active = true
   ORDER BY updated_at DESC
   LIMIT 1;
  NEW.cost_rate_at_time := v_rate;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_time_entry_cost ON public.time_entries;
CREATE TRIGGER trg_stamp_time_entry_cost
BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.stamp_time_entry_cost();
