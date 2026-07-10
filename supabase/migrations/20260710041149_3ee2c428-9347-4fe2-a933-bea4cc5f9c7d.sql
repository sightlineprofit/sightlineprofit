
-- 1. Rescope email-related policies from public to service_role
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT TO service_role USING (true);

-- 2. Rescope project_milestones policies to authenticated
DROP POLICY IF EXISTS project_milestones_select ON public.project_milestones;
DROP POLICY IF EXISTS project_milestones_write ON public.project_milestones;
CREATE POLICY project_milestones_select ON public.project_milestones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_milestones.project_id AND p.firm_id = public.current_firm_id()));
CREATE POLICY project_milestones_write ON public.project_milestones
  FOR ALL TO authenticated
  USING (public.is_firm_admin() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_milestones.project_id AND p.firm_id = public.current_firm_id()))
  WITH CHECK (public.is_firm_admin() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_milestones.project_id AND p.firm_id = public.current_firm_id()));

-- 3. Add explicit service_role-only policy on stripe_webhook_events
CREATE POLICY stripe_webhook_events_service_role ON public.stripe_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Restrict realtime.messages broadcast to service_role only (no client broadcast/presence in this app)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS realtime_service_role_only ON realtime.messages';
    EXECUTE 'CREATE POLICY realtime_service_role_only ON realtime.messages FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 5. Revoke public EXECUTE on SECURITY DEFINER functions; re-grant only RLS helpers to authenticated
REVOKE EXECUTE ON FUNCTION public.current_firm_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_firm_tier() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_firm_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_firm_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_firm_principal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.founding_slots_remaining() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_firm_internal_project(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_time_entry(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_firm_activity_types(uuid) FROM PUBLIC, anon, authenticated;

-- Re-grant EXECUTE on RLS helper functions to authenticated so policies evaluating them succeed
GRANT EXECUTE ON FUNCTION public.current_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_firm_tier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_firm_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_firm_principal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founding_slots_remaining() TO authenticated;
