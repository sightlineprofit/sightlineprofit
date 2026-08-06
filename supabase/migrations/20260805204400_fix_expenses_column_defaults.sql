-- Ensure category column has a default so inserts without a
-- category value never fail.
ALTER TABLE public.expenses
ALTER COLUMN category
SET DEFAULT 'other';

-- Ensure frequency column has a default for the same reason.
ALTER TABLE public.expenses
ALTER COLUMN frequency
SET DEFAULT 'annual';
