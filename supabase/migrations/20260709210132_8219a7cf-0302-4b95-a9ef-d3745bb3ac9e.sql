
-- Backfill missing seeded activity types for existing firms
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.firms f
           WHERE NOT EXISTS (SELECT 1 FROM public.activity_types a WHERE a.firm_id = f.id)
  LOOP
    PERFORM public.seed_firm_activity_types(r.id);
  END LOOP;
END $$;

-- Auto-seed activity types on new firm creation
CREATE OR REPLACE FUNCTION public.seed_activity_types_on_firm_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_firm_activity_types(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS firms_seed_activity_types ON public.firms;
CREATE TRIGGER firms_seed_activity_types
AFTER INSERT ON public.firms
FOR EACH ROW EXECUTE FUNCTION public.seed_activity_types_on_firm_insert();
