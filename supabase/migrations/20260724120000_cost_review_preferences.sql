-- Track when cost structure was last reviewed and aligned rate at that time.
ALTER TABLE public.firm_preferences
  ADD COLUMN IF NOT EXISTS last_cost_review_date date,
  ADD COLUMN IF NOT EXISTS aligned_rate_at_last_review numeric(10, 4);
