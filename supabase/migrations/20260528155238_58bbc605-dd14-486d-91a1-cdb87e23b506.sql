
ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS billable_rate numeric,
  ADD COLUMN IF NOT EXISTS cost_rate numeric,
  ADD COLUMN IF NOT EXISTS expected_hrs_per_week numeric,
  ADD COLUMN IF NOT EXISTS weeks_per_year numeric,
  ADD COLUMN IF NOT EXISTS billable_pct numeric;

CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_firm_email_uniq
  ON public.team_invitations (firm_id, email);
