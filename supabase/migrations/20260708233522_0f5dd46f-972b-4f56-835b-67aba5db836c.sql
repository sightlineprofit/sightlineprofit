
-- ============ activity_types ============
CREATE TABLE public.activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_billable boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, name)
);
CREATE INDEX activity_types_firm_idx ON public.activity_types(firm_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_types TO authenticated;
GRANT ALL ON public.activity_types TO service_role;

ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members view activity types"
  ON public.activity_types FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "Admins insert activity types"
  ON public.activity_types FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "Admins update activity types"
  ON public.activity_types FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin() AND is_system = false)
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin() AND is_system = false);

CREATE POLICY "Admins delete activity types"
  ON public.activity_types FOR DELETE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin() AND is_default = false AND is_system = false);

CREATE TRIGGER activity_types_updated_at BEFORE UPDATE ON public.activity_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ internal_projects ============
CREATE TABLE public.internal_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL UNIQUE REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_projects TO authenticated;
GRANT ALL ON public.internal_projects TO service_role;

ALTER TABLE public.internal_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members view internal project"
  ON public.internal_projects FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "Admins manage internal project"
  ON public.internal_projects FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE TRIGGER internal_projects_updated_at BEFORE UPDATE ON public.internal_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ time_entries new columns ============
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS activity_type_id uuid REFERENCES public.activity_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS activity_reassigned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activity_reassigned_from text,
  ADD COLUMN IF NOT EXISTS activity_reassigned_at timestamptz;

CREATE INDEX IF NOT EXISTS time_entries_activity_idx ON public.time_entries(activity_type_id);

-- ============ Backfill seeding for existing + new firms ============
CREATE OR REPLACE FUNCTION public.seed_firm_activity_types(p_firm_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_types (firm_id, name, is_billable, is_default, is_system, color, sort_order)
  VALUES
    (p_firm_id, 'Internal Admin',        false, true, false, '#8A7F75', 1),
    (p_firm_id, 'Business Development',  false, true, false, '#B8860B', 2),
    (p_firm_id, 'Client Meeting Prep',   true,  true, false, '#5C8A6E', 3),
    (p_firm_id, 'Onsite Visit',          true,  true, false, '#4A7FA5', 4),
    (p_firm_id, 'Team Meeting',          false, true, false, '#7A6EA0', 5),
    (p_firm_id, 'Uncategorized',         false, true, true,  '#C4C0BB', 99)
  ON CONFLICT (firm_id, name) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_firm_internal_project(p_firm_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_firm_name text;
BEGIN
  SELECT id INTO v_id FROM public.internal_projects WHERE firm_id = p_firm_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT name INTO v_firm_name FROM public.firms WHERE id = p_firm_id;
  INSERT INTO public.internal_projects (firm_id, name)
  VALUES (p_firm_id, coalesce(v_firm_name, 'Firm') || ' — Internal')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Backfill for existing firms
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.firms LOOP
    PERFORM public.seed_firm_activity_types(r.id);
    PERFORM public.ensure_firm_internal_project(r.id);
  END LOOP;
END $$;
