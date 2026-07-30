-- Firm resource document attachments (Supabase Storage) + optional external links.

ALTER TABLE public.firm_resources
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text;

COMMENT ON COLUMN public.firm_resources.file_path IS 'Storage object path in firm-resources bucket';
COMMENT ON COLUMN public.firm_resources.file_name IS 'Original uploaded file name for display';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firm-resources',
  'firm-resources',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS firm_resources_storage_select ON storage.objects;
CREATE POLICY firm_resources_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'firm-resources'
    AND (storage.foldername(name))[1] = public.current_firm_id()::text
  );

DROP POLICY IF EXISTS firm_resources_storage_insert ON storage.objects;
CREATE POLICY firm_resources_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'firm-resources'
    AND (storage.foldername(name))[1] = public.current_firm_id()::text
    AND public.is_firm_admin()
  );

DROP POLICY IF EXISTS firm_resources_storage_update ON storage.objects;
CREATE POLICY firm_resources_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'firm-resources'
    AND (storage.foldername(name))[1] = public.current_firm_id()::text
    AND public.is_firm_admin()
  )
  WITH CHECK (
    bucket_id = 'firm-resources'
    AND (storage.foldername(name))[1] = public.current_firm_id()::text
    AND public.is_firm_admin()
  );

DROP POLICY IF EXISTS firm_resources_storage_delete ON storage.objects;
CREATE POLICY firm_resources_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'firm-resources'
    AND (storage.foldername(name))[1] = public.current_firm_id()::text
    AND public.is_firm_admin()
  );
