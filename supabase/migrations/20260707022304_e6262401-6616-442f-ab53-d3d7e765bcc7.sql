CREATE TYPE public.change_log_category AS ENUM (
  'rate_architecture','owner_compensation','team_cost','team_capacity','operating_expenses'
);

CREATE TABLE public.firm_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  category public.change_log_category NOT NULL,
  entity_label text NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_firm_change_log_firm_cat_time
  ON public.firm_change_log (firm_id, category, created_at DESC);

GRANT SELECT ON public.firm_change_log TO authenticated;
GRANT ALL ON public.firm_change_log TO service_role;

ALTER TABLE public.firm_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members can view their firm's change log"
  ON public.firm_change_log
  FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());
