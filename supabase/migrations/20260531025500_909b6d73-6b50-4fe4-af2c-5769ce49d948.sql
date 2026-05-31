-- 1) Soft delete for sop_templates
ALTER TABLE public.sop_templates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sop_templates_deleted_at ON public.sop_templates(deleted_at);

-- 2) Per-user SOP preferences (hide templates from personal view)
CREATE TABLE IF NOT EXISTS public.user_sop_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  template_id uuid NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sop_preferences TO authenticated;
GRANT ALL ON public.user_sop_preferences TO service_role;

ALTER TABLE public.user_sop_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY usp_select ON public.user_sop_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY usp_insert ON public.user_sop_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY usp_update ON public.user_sop_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY usp_delete ON public.user_sop_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_usp_user ON public.user_sop_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_usp_template ON public.user_sop_preferences(template_id);