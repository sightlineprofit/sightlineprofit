
CREATE TABLE IF NOT EXISTS public.firm_signal_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL UNIQUE REFERENCES public.firms(id) ON DELETE CASCADE,
  pricing_gap_pct numeric(6,2) DEFAULT 0,
  util_gap_pct numeric(6,2) DEFAULT 0,
  cost_gap_pct numeric(6,2) DEFAULT 0,
  primary_profile text,
  last_action_type text,
  last_action_suggested_at timestamptz,
  cycle_count integer NOT NULL DEFAULT 0,
  last_metric_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_signal_state TO authenticated;
GRANT ALL ON public.firm_signal_state TO service_role;

ALTER TABLE public.firm_signal_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_state_read_own_firm"
  ON public.firm_signal_state FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "signal_state_write_admin"
  ON public.firm_signal_state FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "signal_state_update_admin"
  ON public.firm_signal_state FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "signal_state_delete_admin"
  ON public.firm_signal_state FOR DELETE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE TRIGGER firm_signal_state_set_updated_at
  BEFORE UPDATE ON public.firm_signal_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
