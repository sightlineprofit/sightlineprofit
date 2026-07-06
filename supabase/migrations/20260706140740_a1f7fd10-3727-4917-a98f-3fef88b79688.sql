CREATE TABLE public.aligned_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  rate numeric(10,2) NOT NULL,
  previous_rate numeric(10,2),
  change_reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aligned_rate_history_firm_time ON public.aligned_rate_history(firm_id, changed_at DESC);

GRANT SELECT, INSERT ON public.aligned_rate_history TO authenticated;
GRANT ALL ON public.aligned_rate_history TO service_role;

ALTER TABLE public.aligned_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members read rate history"
  ON public.aligned_rate_history FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "Firm admins insert rate history"
  ON public.aligned_rate_history FOR INSERT
  TO authenticated
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
