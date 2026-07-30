-- Firm vision board, goals, and firm-level milestones (/future page).

CREATE TABLE IF NOT EXISTS public.firm_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('time', 'income', 'team', 'clients', 'firm', 'personal', 'other')),
  timeframe text NOT NULL DEFAULT 'this_year'
    CHECK (timeframe IN ('this_year', 'next_year', 'someday')),
  target_date date,
  target_value numeric(12, 2),
  target_unit text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'missed', 'paused')),
  linked_metric text
    CHECK (
      linked_metric IS NULL
      OR linked_metric IN (
        'annual_draw',
        'weekly_hours',
        'min_project_fee',
        'team_headcount',
        'portfolio_realized_rate',
        'annual_revenue'
      )
    ),
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  achieved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firm_goals_firm_timeframe_idx
  ON public.firm_goals (firm_id, timeframe, sort_order);

CREATE TABLE IF NOT EXISTS public.firm_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_date date,
  milestone_type text NOT NULL DEFAULT 'goal'
    CHECK (milestone_type IN ('goal', 'hire', 'revenue', 'personal', 'directional')),
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('achieved', 'active', 'upcoming', 'missed')),
  detail text,
  linked_goal_id uuid REFERENCES public.firm_goals(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firm_milestones_firm_date_idx
  ON public.firm_milestones (firm_id, target_date NULLS LAST);

CREATE TABLE IF NOT EXISTS public.firm_vision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL UNIQUE REFERENCES public.firms(id) ON DELETE CASCADE,
  anchor_statement text,
  quarterly_focus_word text,
  quarterly_focus_quarter text,
  quarterly_review_note text,
  pinterest_access_token text,
  pinterest_refresh_token text,
  pinterest_connected_at timestamptz,
  selected_board_ids text[],
  uploaded_image_urls text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firm_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_vision ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_vision TO authenticated;
GRANT ALL ON public.firm_goals TO service_role;
GRANT ALL ON public.firm_milestones TO service_role;
GRANT ALL ON public.firm_vision TO service_role;

CREATE POLICY firm_goals_select ON public.firm_goals
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY firm_goals_write ON public.firm_goals
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY firm_milestones_select ON public.firm_milestones
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id());

CREATE POLICY firm_milestones_write ON public.firm_milestones
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());

-- Vision row: principals/admins only (same as firm admin gate).
CREATE POLICY firm_vision_select ON public.firm_vision
  FOR SELECT TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());

CREATE POLICY firm_vision_write ON public.firm_vision
  FOR ALL TO authenticated
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
