-- Client contact fields on projects (captured at setup, editable in project details).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS client_preferred_communication text;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_client_preferred_communication_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_client_preferred_communication_check
  CHECK (
    client_preferred_communication IS NULL
    OR client_preferred_communication IN ('email', 'phone', 'text', 'in_person')
  );

COMMENT ON COLUMN public.projects.client_email IS 'Primary client contact email.';
COMMENT ON COLUMN public.projects.client_phone IS 'Primary client contact phone.';
COMMENT ON COLUMN public.projects.client_preferred_communication IS 'Preferred channel: email, phone, text, in_person.';
