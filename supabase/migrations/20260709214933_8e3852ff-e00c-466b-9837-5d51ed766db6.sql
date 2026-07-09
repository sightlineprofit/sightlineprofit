DROP POLICY IF EXISTS "founding_access_select_authenticated" ON public.founding_access;
CREATE POLICY "founding_access_select_authenticated"
  ON public.founding_access FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());
