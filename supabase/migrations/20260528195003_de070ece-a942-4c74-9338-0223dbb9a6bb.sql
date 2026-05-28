-- Manual hour logs for Foundation tier users
CREATE TYPE public.manual_hour_period AS ENUM ('week', 'month');

CREATE TABLE public.manual_hour_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_type public.manual_hour_period NOT NULL,
  total_hrs_worked numeric(10,2) NOT NULL DEFAULT 0,
  billable_hrs numeric(10,2) NOT NULL DEFAULT 0,
  non_billable_hrs numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_hour_logs_billable_le_total CHECK (billable_hrs <= total_hrs_worked),
  CONSTRAINT manual_hour_logs_non_negative CHECK (total_hrs_worked >= 0 AND billable_hrs >= 0),
  CONSTRAINT manual_hour_logs_unique_period UNIQUE (firm_id, user_id, period_type, period_start)
);

CREATE INDEX idx_manual_hour_logs_firm_period
  ON public.manual_hour_logs (firm_id, period_type, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_hour_logs TO authenticated;
GRANT ALL ON public.manual_hour_logs TO service_role;

ALTER TABLE public.manual_hour_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY manual_hour_logs_select ON public.manual_hour_logs
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY manual_hour_logs_insert ON public.manual_hour_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (user_id = auth.uid() OR public.is_firm_admin())
  );

CREATE POLICY manual_hour_logs_update ON public.manual_hour_logs
  FOR UPDATE TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (user_id = auth.uid() OR public.is_firm_admin())
  )
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND (user_id = auth.uid() OR public.is_firm_admin())
  );

CREATE POLICY manual_hour_logs_delete ON public.manual_hour_logs
  FOR DELETE TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND (user_id = auth.uid() OR public.is_firm_admin())
  );

CREATE TRIGGER trg_manual_hour_logs_updated_at
  BEFORE UPDATE ON public.manual_hour_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_hour_logs;