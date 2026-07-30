-- Raise firm-resources bucket limit to Supabase Free tier max (50 MB).

UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'firm-resources';
