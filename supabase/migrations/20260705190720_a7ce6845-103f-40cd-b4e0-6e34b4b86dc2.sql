
-- 1A: owner_compensation table
CREATE TABLE public.owner_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comp_draw_annual numeric(12,2),
  payroll_tax_pct numeric(5,2) DEFAULT 15.3,
  health_insurance_annual numeric(12,2),
  retirement_annual numeric(12,2),
  distribution_annual numeric(12,2),
  reserve_target numeric(12,2),
  reserve_months integer,
  compensation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_compensation TO authenticated;
GRANT ALL ON public.owner_compensation TO service_role;

ALTER TABLE public.owner_compensation ENABLE ROW LEVEL SECURITY;

-- Anyone in the firm can view
CREATE POLICY "owner_comp_select"
  ON public.owner_compensation FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());

-- Principals can insert their own row
CREATE POLICY "owner_comp_insert_own"
  ON public.owner_compensation FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND profile_id = auth.uid()
    AND public.current_user_role() = 'principal'
  );

-- Principals can update their own row
CREATE POLICY "owner_comp_update_own"
  ON public.owner_compensation FOR UPDATE
  TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND profile_id = auth.uid()
    AND public.current_user_role() = 'principal'
  )
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND profile_id = auth.uid()
    AND public.current_user_role() = 'principal'
  );

-- Principals can delete their own row
CREATE POLICY "owner_comp_delete_own"
  ON public.owner_compensation FOR DELETE
  TO authenticated
  USING (
    firm_id = public.current_firm_id()
    AND profile_id = auth.uid()
    AND public.current_user_role() = 'principal'
  );

CREATE TRIGGER owner_compensation_set_updated_at
  BEFORE UPDATE ON public.owner_compensation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1B: data migration from firm_config → owner_compensation
INSERT INTO public.owner_compensation (
  firm_id, profile_id,
  comp_draw_annual, payroll_tax_pct,
  health_insurance_annual, retirement_annual,
  distribution_annual, reserve_target
)
SELECT
  fc.firm_id,
  p.id,
  fc.comp_draw_annual,
  COALESCE(fc.comp_ptax_pct, 15.3),
  fc.comp_health_annual,
  fc.comp_retire_annual,
  fc.comp_distribution_annual,
  fc.comp_reserve_target_annual
FROM public.firm_config fc
JOIN LATERAL (
  SELECT id FROM public.profiles
  WHERE firm_id = fc.firm_id AND role = 'principal'
  ORDER BY created_at ASC
  LIMIT 1
) p ON true
WHERE (
  fc.comp_draw_annual IS NOT NULL
  OR fc.comp_ptax_pct IS NOT NULL
  OR fc.comp_health_annual IS NOT NULL
  OR fc.comp_retire_annual IS NOT NULL
  OR fc.comp_distribution_annual IS NOT NULL
  OR fc.comp_reserve_target_annual IS NOT NULL
)
ON CONFLICT (firm_id, profile_id) DO NOTHING;

-- Mark firm_config compensation columns as deprecated
COMMENT ON COLUMN public.firm_config.comp_draw_annual IS 'DEPRECATED: use owner_compensation.comp_draw_annual';
COMMENT ON COLUMN public.firm_config.comp_ptax_pct IS 'DEPRECATED: use owner_compensation.payroll_tax_pct';
COMMENT ON COLUMN public.firm_config.comp_health_annual IS 'DEPRECATED: use owner_compensation.health_insurance_annual';
COMMENT ON COLUMN public.firm_config.comp_retire_annual IS 'DEPRECATED: use owner_compensation.retirement_annual';
COMMENT ON COLUMN public.firm_config.comp_distribution_annual IS 'DEPRECATED: use owner_compensation.distribution_annual';
COMMENT ON COLUMN public.firm_config.comp_reserve_target_annual IS 'DEPRECATED: use owner_compensation.reserve_target';
