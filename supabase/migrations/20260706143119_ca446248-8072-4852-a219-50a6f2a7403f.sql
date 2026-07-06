
CREATE TABLE public.firm_action_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('rate_increase','utilization','cost_reduction','settings_update','proposal_sent')),
  target_value numeric(12,2),
  committed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  outcome text CHECK (outcome IN ('completed','reconsidered','expired')),
  settings_updated boolean NOT NULL DEFAULT false,
  notes text,
  scenario_group uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_action_commitments TO authenticated;
GRANT ALL ON public.firm_action_commitments TO service_role;

ALTER TABLE public.firm_action_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members can view commitments"
  ON public.firm_action_commitments FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "Firm members can insert commitments"
  ON public.firm_action_commitments FOR INSERT
  TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "Firm members can update commitments"
  ON public.firm_action_commitments FOR UPDATE
  TO authenticated
  USING (firm_id = public.current_firm_id())
  WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "Firm admins can delete commitments"
  ON public.firm_action_commitments FOR DELETE
  TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE TRIGGER firm_action_commitments_set_updated_at
  BEFORE UPDATE ON public.firm_action_commitments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_firm_action_commitments_firm ON public.firm_action_commitments(firm_id, committed_at DESC);
CREATE INDEX idx_firm_action_commitments_scenario ON public.firm_action_commitments(scenario_group);
