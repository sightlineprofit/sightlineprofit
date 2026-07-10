UPDATE public.firms
SET onboarding_completed = true,
    onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE onboarding_completed = false;