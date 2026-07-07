
-- 1. firm_action_commitments: require admin for INSERT/UPDATE
DROP POLICY IF EXISTS "Firm members can insert commitments" ON public.firm_action_commitments;
DROP POLICY IF EXISTS "Firm members can update commitments" ON public.firm_action_commitments;
CREATE POLICY "Firm admins can insert commitments" ON public.firm_action_commitments
  FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
CREATE POLICY "Firm admins can update commitments" ON public.firm_action_commitments
  FOR UPDATE TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- 2. team_invitations: restrict SELECT to firm admins (tokens are sensitive)
DROP POLICY IF EXISTS invites_select ON public.team_invitations;
CREATE POLICY invites_select ON public.team_invitations
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- 3. firms: prevent principals from changing billing columns via API
CREATE OR REPLACE FUNCTION public.prevent_firm_billing_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier   IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Billing and ownership columns can only be modified by billing services or super admins';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS firms_prevent_billing_changes ON public.firms;
CREATE TRIGGER firms_prevent_billing_changes
  BEFORE UPDATE ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.prevent_firm_billing_changes();

-- 4. knowledge-base storage: only serve files linked to published items
DROP POLICY IF EXISTS "kb public read" ON storage.objects;
CREATE POLICY "kb published read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'knowledge-base' AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.knowledge_base_items kbi
        WHERE kbi.status = 'published'
          AND (kbi.video_file_path = storage.objects.name
               OR kbi.thumbnail_path  = storage.objects.name)
      )
    )
  );

-- 5. Set fixed search_path on functions that were missing it
ALTER FUNCTION public.delete_email(text, bigint)        SET search_path = public, pg_temp;
ALTER FUNCTION public.enqueue_email(text, jsonb)        SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                  SET search_path = public, pg_temp;

-- 6. Revoke EXECUTE from anon and PUBLIC on all SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION
  public.current_firm_id(),
  public.current_firm_tier(),
  public.current_user_role(),
  public.get_user_firm_id(),
  public.get_user_role(),
  public.is_firm_admin(),
  public.is_firm_principal(),
  public.is_super_admin(),
  public.handle_new_user(),
  public.prevent_super_admin_self_grant(),
  public.prevent_firm_billing_changes(),
  public.stamp_time_entry_cost(),
  public.set_updated_at(),
  public.save_time_entry(jsonb),
  public.delete_email(text, bigint),
  public.enqueue_email(text, jsonb),
  public.read_email_batch(text, integer, integer),
  public.move_to_dlq(text, text, bigint, jsonb),
  public.email_queue_dispatch(),
  public.email_queue_wake()
FROM PUBLIC, anon;

-- 7. Revoke EXECUTE from authenticated on internal-only helpers
--    (trigger functions and email-queue plumbing are never called directly by clients).
REVOKE EXECUTE ON FUNCTION
  public.handle_new_user(),
  public.prevent_super_admin_self_grant(),
  public.prevent_firm_billing_changes(),
  public.stamp_time_entry_cost(),
  public.set_updated_at(),
  public.delete_email(text, bigint),
  public.enqueue_email(text, jsonb),
  public.read_email_batch(text, integer, integer),
  public.move_to_dlq(text, text, bigint, jsonb),
  public.email_queue_dispatch(),
  public.email_queue_wake()
FROM authenticated;
