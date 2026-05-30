ALTER TABLE public.projects ADD COLUMN fixed_fee numeric;
COMMENT ON COLUMN public.projects.fixed_fee IS 'Optional total fixed project fee in dollars. When set, scoped revenue uses this instead of hours x rate.';
COMMENT ON COLUMN public.projects.scoped_rate IS 'Hourly billing rate ($/hr) agreed with the client for this project.';