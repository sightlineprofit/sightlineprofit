ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_home text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz DEFAULT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_home_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_home_check
  CHECK (preferred_home IS NULL OR preferred_home IN ('dashboard','calendar','sightline'));