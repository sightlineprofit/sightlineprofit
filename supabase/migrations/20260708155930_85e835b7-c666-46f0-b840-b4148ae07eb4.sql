-- The firms table has a trigger (prevent_firm_billing_changes) that blocks tier updates
-- outside service_role. Disable it for this migration only.
ALTER TABLE public.firms DISABLE TRIGGER USER;

-- 1. Migrate any existing 'foundation' firms to 'studio'
UPDATE public.firms SET subscription_tier = 'studio' WHERE subscription_tier = 'foundation';

-- 2. Drop the default so we can alter the column type
ALTER TABLE public.firms ALTER COLUMN subscription_tier DROP DEFAULT;

-- 3. Rename old enum, create new one without 'foundation', swap the column
ALTER TYPE public.subscription_tier RENAME TO subscription_tier_old;
CREATE TYPE public.subscription_tier AS ENUM ('studio', 'practice');

ALTER TABLE public.firms
  ALTER COLUMN subscription_tier TYPE public.subscription_tier
  USING (subscription_tier::text::public.subscription_tier);

-- 4. Restore default (now 'studio')
ALTER TABLE public.firms ALTER COLUMN subscription_tier SET DEFAULT 'studio'::public.subscription_tier;

-- 5. Drop the old enum
DROP TYPE public.subscription_tier_old;

-- 6. Re-enable triggers
ALTER TABLE public.firms ENABLE TRIGGER USER;

-- 7. Normalize knowledge_base_items.tier_visibility (text[]) — replace 'foundation' with 'studio', dedupe
UPDATE public.knowledge_base_items
SET tier_visibility = (
  SELECT ARRAY(SELECT DISTINCT CASE WHEN x = 'foundation' THEN 'studio' ELSE x END FROM unnest(tier_visibility) x)
)
WHERE 'foundation' = ANY(tier_visibility);