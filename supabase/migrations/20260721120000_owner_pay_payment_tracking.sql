-- Payment tracking on projects, owner draw log, dashboard view preference.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid'));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_collected numeric(12,2);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_collected_date date;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_notes text;

CREATE TABLE IF NOT EXISTS public.owner_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  draw_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  draw_type text NOT NULL CHECK (draw_type IN ('salary', 'distribution')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_draws_firm_date_idx
  ON public.owner_draws (firm_id, draw_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_draws TO authenticated;
GRANT ALL ON public.owner_draws TO service_role;

ALTER TABLE public.owner_draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members view owner_draws"
  ON public.owner_draws FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY "Firm admins insert owner_draws"
  ON public.owner_draws FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "Firm admins update owner_draws"
  ON public.owner_draws FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY "Firm admins delete owner_draws"
  ON public.owner_draws FOR DELETE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

ALTER TABLE public.firm_preferences
  ADD COLUMN IF NOT EXISTS dashboard_primary_view text NOT NULL DEFAULT 'revenue_architecture'
    CHECK (dashboard_primary_view IN ('revenue_architecture', 'aligned_rate'));
