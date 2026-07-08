
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;

ALTER TABLE public.firms
  DROP CONSTRAINT IF EXISTS firms_billing_frequency_check;
ALTER TABLE public.firms
  ADD CONSTRAINT firms_billing_frequency_check CHECK (billing_frequency IN ('monthly','annual'));

ALTER TABLE public.firms
  ALTER COLUMN subscription_status SET DEFAULT 'trialing';

-- Bulk-set all firms to Practice. The prevent_firm_billing_changes trigger
-- normally blocks subscription_tier writes; disable it just for this UPDATE.
ALTER TABLE public.firms DISABLE TRIGGER USER;
UPDATE public.firms SET subscription_tier = 'practice'
  WHERE subscription_tier IS DISTINCT FROM 'practice';
ALTER TABLE public.firms ENABLE TRIGGER USER;

CREATE TABLE IF NOT EXISTS public.founding_access (
  firm_id uuid PRIMARY KEY REFERENCES public.firms(id) ON DELETE CASCADE,
  stripe_price_id text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.founding_access TO authenticated;
GRANT ALL ON public.founding_access TO service_role;

ALTER TABLE public.founding_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founding_access_select_authenticated" ON public.founding_access;
CREATE POLICY "founding_access_select_authenticated"
  ON public.founding_access FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.founding_slots_remaining()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(0, 100 - (SELECT count(*)::int FROM public.founding_access))
$$;

GRANT EXECUTE ON FUNCTION public.founding_slots_remaining() TO authenticated, anon;
