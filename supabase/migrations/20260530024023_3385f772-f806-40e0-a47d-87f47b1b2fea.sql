CREATE TABLE public.project_financial_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT
);

CREATE INDEX idx_pfa_project ON public.project_financial_audit(project_id, changed_at DESC);

GRANT SELECT, INSERT ON public.project_financial_audit TO authenticated;
GRANT ALL ON public.project_financial_audit TO service_role;

ALTER TABLE public.project_financial_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pfa_select_principal"
ON public.project_financial_audit
FOR SELECT
TO authenticated
USING (firm_id = public.current_firm_id() AND public.is_firm_principal());

CREATE POLICY "pfa_insert_principal"
ON public.project_financial_audit
FOR INSERT
TO authenticated
WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_principal() AND changed_by = auth.uid());
