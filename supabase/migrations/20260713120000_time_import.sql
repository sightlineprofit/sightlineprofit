-- Time history import: audit log table + trace columns on time_entries

CREATE TABLE public.time_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL REFERENCES auth.users(id),
  source text NOT NULL CHECK (source IN (
    'clockify', 'harvest', 'toggl', 'excel',
    'studio_designer', 'generic_csv'
  )),
  filename text NOT NULL,
  rows_found integer NOT NULL,
  rows_imported integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  rows_errored integer NOT NULL DEFAULT 0,
  skipped_detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  date_range_start date,
  date_range_end date
);

CREATE INDEX time_import_logs_firm_idx ON public.time_import_logs(firm_id, imported_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.time_import_logs TO authenticated;
GRANT ALL ON public.time_import_logs TO service_role;

ALTER TABLE public.time_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_import_logs_select ON public.time_import_logs
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY time_import_logs_insert ON public.time_import_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND public.is_firm_admin()
    AND imported_by = auth.uid()
  );

CREATE POLICY time_import_logs_update ON public.time_import_logs
  FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS imported_from text,
  ADD COLUMN IF NOT EXISTS import_log_id uuid REFERENCES public.time_import_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_import_log_idx ON public.time_entries(import_log_id);
