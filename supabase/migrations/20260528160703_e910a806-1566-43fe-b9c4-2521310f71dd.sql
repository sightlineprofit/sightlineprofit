
-- USER METRIC PREFERENCES --------------------------------------------------
CREATE TABLE public.user_metric_prefs (
  user_id uuid PRIMARY KEY,
  hidden_metrics text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_metric_prefs TO authenticated;
GRANT ALL ON public.user_metric_prefs TO service_role;

ALTER TABLE public.user_metric_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ump_select ON public.user_metric_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ump_insert ON public.user_metric_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY ump_update ON public.user_metric_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ump_delete ON public.user_metric_prefs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- SCENARIOS ----------------------------------------------------------------
CREATE TABLE public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
GRANT ALL ON public.scenarios TO service_role;

ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY scenarios_select ON public.scenarios
  FOR SELECT TO authenticated USING (firm_id = current_firm_id());
CREATE POLICY scenarios_write ON public.scenarios
  FOR ALL TO authenticated
  USING (firm_id = current_firm_id() AND is_firm_admin())
  WITH CHECK (firm_id = current_firm_id() AND is_firm_admin());

CREATE INDEX scenarios_firm_idx ON public.scenarios(firm_id, created_at DESC);

-- KNOWLEDGE ARTICLES (admin-managed via service role) ----------------------
CREATE TYPE public.kb_category AS ENUM ('rate_architecture','cash_management','team_growth','using_sightline');
CREATE TYPE public.kb_kind AS ENUM ('article','video');

CREATE TABLE public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category public.kb_category NOT NULL,
  kind public.kb_kind NOT NULL DEFAULT 'article',
  thumbnail_url text,
  excerpt text,
  body text,
  video_url text,
  read_minutes int,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.knowledge_articles TO authenticated;
GRANT ALL ON public.knowledge_articles TO service_role;

ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_read ON public.knowledge_articles
  FOR SELECT TO authenticated USING (published_at IS NOT NULL);

CREATE INDEX kb_published_idx ON public.knowledge_articles(published_at DESC);

-- Seed sample knowledge articles
INSERT INTO public.knowledge_articles (title, slug, category, kind, excerpt, read_minutes, published_at) VALUES
  ('What "Aligned Rate" actually means', 'aligned-rate-explained', 'rate_architecture', 'article',
   'The rate that covers your real cost of being in business — plus the margin you committed to.', 5, now() - interval '2 days'),
  ('Cash management for project-based studios', 'cash-management-basics', 'cash_management', 'article',
   'How to think about cash when revenue arrives in lumps and expenses arrive monthly.', 7, now() - interval '6 days'),
  ('Hiring your first employee — the real math', 'first-hire-math', 'team_growth', 'video',
   'Fully burdened cost, expected utilization, and the break-even billable rate.', 9, now() - interval '10 days'),
  ('A 10-minute tour of Sightline', 'sightline-tour', 'using_sightline', 'video',
   'The shortest path from onboarding to your first answered question.', 10, now() - interval '14 days');
