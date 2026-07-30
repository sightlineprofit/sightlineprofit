-- Attribute time to roster members who don't have a Sightline login yet.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS firm_member_id uuid REFERENCES public.firm_members(id) ON DELETE SET NULL;

ALTER TABLE public.time_entries
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_has_attribution;

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_has_attribution
  CHECK (user_id IS NOT NULL OR firm_member_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS time_entries_firm_member_idx ON public.time_entries(firm_member_id);
