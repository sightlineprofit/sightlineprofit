-- Google / Outlook calendar overlay (read-only v1: Google)

CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_oauth_states_expires_idx
  ON public.calendar_oauth_states (expires_at);

GRANT ALL ON public.calendar_oauth_states TO service_role;

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google')),
  account_email text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  calendar_id text NOT NULL DEFAULT 'primary',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS calendar_connections_user_idx
  ON public.calendar_connections (user_id);

GRANT ALL ON public.calendar_connections TO service_role;

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  linked_time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS calendar_events_user_range_idx
  ON public.calendar_events (user_id, start_at, end_at);

GRANT SELECT ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_select_own ON public.calendar_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
