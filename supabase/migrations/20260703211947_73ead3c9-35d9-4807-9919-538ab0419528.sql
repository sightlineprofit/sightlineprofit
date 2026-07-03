
ALTER TABLE public.firms 
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS last_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_demo_loaded_at timestamptz;

ALTER TABLE public.firms
  DROP CONSTRAINT IF EXISTS firms_data_status_chk;
ALTER TABLE public.firms
  ADD CONSTRAINT firms_data_status_chk CHECK (data_status IN ('clean','demo_data'));

-- Create the singleton demo firm using a stable id. owner_id must reference
-- an existing auth.users row, so use the first super admin.
DO $$
DECLARE
  v_super uuid;
BEGIN
  SELECT id INTO v_super FROM public.profiles WHERE is_super_admin = true LIMIT 1;
  IF v_super IS NULL THEN
    RAISE NOTICE 'No super admin yet; skipping demo firm seed.';
    RETURN;
  END IF;
  INSERT INTO public.firms (id, name, owner_id, subscription_tier, subscription_status, is_demo, trial_ends_at)
  VALUES (
    '00000000-0000-0000-0000-000000000d10'::uuid,
    'Aldrich Studio — Demo',
    v_super,
    'practice',
    'active',
    true,
    now() + interval '10 years'
  )
  ON CONFLICT (id) DO UPDATE
    SET is_demo = true,
        subscription_tier = 'practice',
        name = EXCLUDED.name;
END
$$;
