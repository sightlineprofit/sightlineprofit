-- Helper for updated_at triggers (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1. Super admin flag + impersonation field on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS impersonated_firm_id uuid;

CREATE OR REPLACE FUNCTION public.prevent_super_admin_self_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
      RAISE EXCEPTION 'is_super_admin cannot be changed via the API';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_prevent_super_grant ON public.profiles;
CREATE TRIGGER profiles_prevent_super_grant
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_self_grant();

-- 2. is_super_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- 3. current_firm_id honors impersonation
CREATE OR REPLACE FUNCTION public.current_firm_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(impersonated_firm_id, firm_id) FROM public.profiles WHERE id = auth.uid()
$$;

-- 4. Role helpers grant super admin
CREATE OR REPLACE FUNCTION public.is_firm_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT is_super_admin OR role IN ('principal','admin') FROM public.profiles WHERE id = auth.uid()),
    false)
$$;

CREATE OR REPLACE FUNCTION public.is_firm_principal()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT is_super_admin OR role = 'principal' FROM public.profiles WHERE id = auth.uid()),
    false)
$$;

-- 5. Cross-firm read
DROP POLICY IF EXISTS firms_select ON public.firms;
CREATE POLICY firms_select ON public.firms FOR SELECT TO authenticated
  USING (id = public.current_firm_id() OR public.is_super_admin());

DROP POLICY IF EXISTS firms_update ON public.firms;
CREATE POLICY firms_update ON public.firms FOR UPDATE TO authenticated
  USING ((id = public.current_firm_id() AND public.is_firm_principal()) OR public.is_super_admin())
  WITH CHECK (id = public.current_firm_id() OR public.is_super_admin());

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR firm_id = public.current_firm_id() OR public.is_super_admin());

-- 6. KB CMS
DO $$ BEGIN CREATE TYPE public.kb_item_type AS ENUM ('article','video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.kb_status AS ENUM ('draft','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.knowledge_base_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.kb_item_type NOT NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  summary text,
  body jsonb,
  video_url text,
  video_file_path text,
  thumbnail_path text,
  tags text[] NOT NULL DEFAULT '{}',
  tier_visibility text[] NOT NULL DEFAULT ARRAY['foundation','studio','practice']::text[],
  status public.kb_status NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.knowledge_base_items TO authenticated;
GRANT ALL ON public.knowledge_base_items TO service_role;
ALTER TABLE public.knowledge_base_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kbi_read ON public.knowledge_base_items;
CREATE POLICY kbi_read ON public.knowledge_base_items FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_super_admin());

DROP POLICY IF EXISTS kbi_write ON public.knowledge_base_items;
CREATE POLICY kbi_write ON public.knowledge_base_items FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP TRIGGER IF EXISTS kbi_set_updated_at ON public.knowledge_base_items;
CREATE TRIGGER kbi_set_updated_at BEFORE UPDATE ON public.knowledge_base_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Webhook log
CREATE TABLE IF NOT EXISTS public.webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_tag text NOT NULL,
  firm_id uuid,
  recipient_email text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

GRANT SELECT ON public.webhook_log TO authenticated;
GRANT ALL ON public.webhook_log TO service_role;
ALTER TABLE public.webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wl_super ON public.webhook_log;
CREATE POLICY wl_super ON public.webhook_log FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE INDEX IF NOT EXISTS webhook_log_created_at_idx ON public.webhook_log (created_at DESC);

-- 8. App settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_mode boolean NOT NULL DEFAULT false,
  default_activity_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS as_read ON public.app_settings;
CREATE POLICY as_read ON public.app_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS as_write ON public.app_settings;
CREATE POLICY as_write ON public.app_settings FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 9. KB storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-base','knowledge-base', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kb public read" ON storage.objects;
CREATE POLICY "kb public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-base');

DROP POLICY IF EXISTS "kb super insert" ON storage.objects;
CREATE POLICY "kb super insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-base' AND public.is_super_admin());

DROP POLICY IF EXISTS "kb super update" ON storage.objects;
CREATE POLICY "kb super update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'knowledge-base' AND public.is_super_admin());

DROP POLICY IF EXISTS "kb super delete" ON storage.objects;
CREATE POLICY "kb super delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-base' AND public.is_super_admin());