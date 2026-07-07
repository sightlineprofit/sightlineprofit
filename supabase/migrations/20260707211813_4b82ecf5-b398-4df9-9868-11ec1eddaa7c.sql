GRANT SELECT, INSERT ON public.firm_change_log TO authenticated;
GRANT ALL ON public.firm_change_log TO service_role;

CREATE POLICY "Firm members can write their firm's change log"
  ON public.firm_change_log FOR INSERT
  TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());