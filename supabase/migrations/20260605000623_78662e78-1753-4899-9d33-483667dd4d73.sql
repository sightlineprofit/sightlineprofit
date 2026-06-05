
ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS invite_token_expiry timestamptz NOT NULL DEFAULT (now() + interval '7 days');

CREATE INDEX IF NOT EXISTS team_invitations_token_idx ON public.team_invitations (token);

-- Backfill expiry for any existing rows (gives them 7 more days)
UPDATE public.team_invitations
  SET invite_token_expiry = now() + interval '7 days'
  WHERE invite_token_expiry IS NULL OR invite_token_expiry < now();
