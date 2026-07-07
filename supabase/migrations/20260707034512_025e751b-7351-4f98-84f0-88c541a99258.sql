-- Project activity log (audit trail for confirmations and nothing-to-report overrides)
CREATE TYPE public.project_activity_event AS ENUM ('nothing_to_report', 'confirmed_reviewed');

CREATE TABLE public.project_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  event_type public.project_activity_event NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_activity_log_project_idx
  ON public.project_activity_log (project_id, occurred_at DESC);

GRANT SELECT, INSERT ON public.project_activity_log TO authenticated;
GRANT ALL ON public.project_activity_log TO service_role;

ALTER TABLE public.project_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm members read project activity log"
  ON public.project_activity_log
  FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "firm members write project activity log"
  ON public.project_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND logged_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.firm_id = public.current_firm_id()
    )
  );

-- Fast-lookup column on projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;
