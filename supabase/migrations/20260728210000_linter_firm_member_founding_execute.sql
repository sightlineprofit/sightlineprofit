-- Supabase linter: current_firm_member_id + founding_slots_remaining callable by anon/authenticated.

REVOKE EXECUTE ON FUNCTION public.current_firm_member_id() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.founding_slots_remaining() FROM PUBLIC, anon, authenticated;

-- Server-side only if ever needed (not exposed to PostgREST clients).
GRANT EXECUTE ON FUNCTION public.founding_slots_remaining() TO service_role;

COMMENT ON FUNCTION public.current_firm_member_id() IS
  'RLS helper only — not callable via PostgREST; used in policies as SECURITY DEFINER.';

COMMENT ON FUNCTION public.founding_slots_remaining() IS
  'Founding cohort counter — service_role / server only; not a public RPC.';
