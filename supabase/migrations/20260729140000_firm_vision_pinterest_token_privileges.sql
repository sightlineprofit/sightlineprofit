-- Defense in depth: Pinterest OAuth tokens are service-role only.
-- Authenticated users (browser Supabase client) must never read or write token columns,
-- even though RLS limits row access to firm admins.

REVOKE SELECT (pinterest_access_token, pinterest_refresh_token)
  ON public.firm_vision
  FROM authenticated;

REVOKE INSERT (pinterest_access_token, pinterest_refresh_token)
  ON public.firm_vision
  FROM authenticated;

REVOKE UPDATE (pinterest_access_token, pinterest_refresh_token)
  ON public.firm_vision
  FROM authenticated;

-- service_role retains full table access (OAuth callback + server functions via supabaseAdmin).

COMMENT ON COLUMN public.firm_vision.pinterest_access_token IS
  'Server-only (service_role). Never SELECT via authenticated / PostgREST client.';
COMMENT ON COLUMN public.firm_vision.pinterest_refresh_token IS
  'Server-only (service_role). Never SELECT via authenticated / PostgREST client.';
