
CREATE TABLE IF NOT EXISTS public.firm_preferences (
  firm_id uuid PRIMARY KEY REFERENCES public.firms(id) ON DELETE CASCADE,
  tour_completed boolean NOT NULL DEFAULT false,
  tour_step integer NOT NULL DEFAULT 0,
  tour_skipped_at timestamptz,
  welcome_banner_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_preferences TO authenticated;
GRANT ALL ON public.firm_preferences TO service_role;

ALTER TABLE public.firm_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Firm members can view firm_preferences" ON public.firm_preferences;
CREATE POLICY "Firm members can view firm_preferences"
  ON public.firm_preferences FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());

DROP POLICY IF EXISTS "Firm members can insert firm_preferences" ON public.firm_preferences;
CREATE POLICY "Firm members can insert firm_preferences"
  ON public.firm_preferences FOR INSERT
  TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());

DROP POLICY IF EXISTS "Firm members can update firm_preferences" ON public.firm_preferences;
CREATE POLICY "Firm members can update firm_preferences"
  ON public.firm_preferences FOR UPDATE
  TO authenticated
  USING (firm_id = public.current_firm_id())
  WITH CHECK (firm_id = public.current_firm_id());

DROP TRIGGER IF EXISTS set_firm_preferences_updated_at ON public.firm_preferences;
CREATE TRIGGER set_firm_preferences_updated_at
  BEFORE UPDATE ON public.firm_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_firm_preferences_on_firm_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.firm_preferences (firm_id)
  VALUES (NEW.id)
  ON CONFLICT (firm_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_firm_preferences ON public.firms;
CREATE TRIGGER trg_create_firm_preferences
  AFTER INSERT ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.create_firm_preferences_on_firm_insert();

INSERT INTO public.firm_preferences (firm_id)
SELECT id FROM public.firms
ON CONFLICT (firm_id) DO NOTHING;
