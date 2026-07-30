-- Optional: tighten owner_draws SELECT to principal only.
-- Requires 20260721120000_owner_pay_payment_tracking.sql (creates owner_draws).
-- Safe to skip if you do not use owner draw tracking yet.

DO $$
BEGIN
  IF to_regclass('public.owner_draws') IS NULL THEN
    RAISE NOTICE 'owner_draws table not found — skipping owner_draws RLS update';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Firm members view owner_draws" ON public.owner_draws';
  EXECUTE 'DROP POLICY IF EXISTS "owner_draws_principal_select" ON public.owner_draws';

  EXECUTE $sql$
    CREATE POLICY "owner_draws_principal_select"
      ON public.owner_draws
      FOR SELECT TO authenticated
      USING (
        firm_id = public.current_firm_id()
        AND public.is_firm_principal()
      )
  $sql$;
END $$;
