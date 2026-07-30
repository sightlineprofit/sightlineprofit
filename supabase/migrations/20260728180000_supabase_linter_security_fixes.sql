-- Supabase linter: security_definer_view (firm_config_team_safe), rls_disabled + sensitive columns (calendar_*).

-- ============ Calendar OAuth: server-only (service_role); no PostgREST access for users ============
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.calendar_oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.calendar_connections FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.calendar_oauth_states TO service_role;
GRANT ALL ON TABLE public.calendar_connections TO service_role;

-- No policies for anon/authenticated → default deny. service_role bypasses RLS.

-- ============ firm_config_team_safe: table + sync (replaces SECURITY DEFINER view) ============
DROP VIEW IF EXISTS public.firm_config_team_safe;

CREATE TABLE public.firm_config_team_safe (
  firm_id uuid PRIMARY KEY REFERENCES public.firm_config (firm_id) ON DELETE CASCADE,
  target_billable_hrs_per_week numeric,
  capacity_view_horizon text NOT NULL DEFAULT '16_weeks',
  capacity_blocks_onboarded boolean NOT NULL DEFAULT false,
  accepting_new_clients boolean NOT NULL DEFAULT true,
  accepting_new_clients_until date
);

COMMENT ON TABLE public.firm_config_team_safe IS
  'Non-financial firm_config fields for team/view_only; synced from firm_config.';

INSERT INTO public.firm_config_team_safe (
  firm_id,
  target_billable_hrs_per_week,
  capacity_view_horizon,
  capacity_blocks_onboarded,
  accepting_new_clients,
  accepting_new_clients_until
)
SELECT
  fc.firm_id,
  fc.target_billable_hrs_per_week,
  fc.capacity_view_horizon,
  fc.capacity_blocks_onboarded,
  fc.accepting_new_clients,
  fc.accepting_new_clients_until
FROM public.firm_config fc
ON CONFLICT (firm_id) DO UPDATE SET
  target_billable_hrs_per_week = EXCLUDED.target_billable_hrs_per_week,
  capacity_view_horizon = EXCLUDED.capacity_view_horizon,
  capacity_blocks_onboarded = EXCLUDED.capacity_blocks_onboarded,
  accepting_new_clients = EXCLUDED.accepting_new_clients,
  accepting_new_clients_until = EXCLUDED.accepting_new_clients_until;

CREATE OR REPLACE FUNCTION public.sync_firm_config_team_safe_from_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.firm_config_team_safe WHERE firm_id = OLD.firm_id;
    RETURN OLD;
  END IF;

  INSERT INTO public.firm_config_team_safe (
    firm_id,
    target_billable_hrs_per_week,
    capacity_view_horizon,
    capacity_blocks_onboarded,
    accepting_new_clients,
    accepting_new_clients_until
  ) VALUES (
    NEW.firm_id,
    NEW.target_billable_hrs_per_week,
    NEW.capacity_view_horizon,
    NEW.capacity_blocks_onboarded,
    NEW.accepting_new_clients,
    NEW.accepting_new_clients_until
  )
  ON CONFLICT (firm_id) DO UPDATE SET
    target_billable_hrs_per_week = EXCLUDED.target_billable_hrs_per_week,
    capacity_view_horizon = EXCLUDED.capacity_view_horizon,
    capacity_blocks_onboarded = EXCLUDED.capacity_blocks_onboarded,
    accepting_new_clients = EXCLUDED.accepting_new_clients,
    accepting_new_clients_until = EXCLUDED.accepting_new_clients_until;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_config_sync_team_safe ON public.firm_config;
DROP TRIGGER IF EXISTS firm_config_sync_team_safe_delete ON public.firm_config;

CREATE TRIGGER firm_config_sync_team_safe
  AFTER INSERT OR UPDATE OF
    target_billable_hrs_per_week,
    capacity_view_horizon,
    capacity_blocks_onboarded,
    accepting_new_clients,
    accepting_new_clients_until
  ON public.firm_config
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_firm_config_team_safe_from_config();

CREATE TRIGGER firm_config_sync_team_safe_delete
  AFTER DELETE ON public.firm_config
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_firm_config_team_safe_from_config();

ALTER TABLE public.firm_config_team_safe ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_config_team_safe_select
  ON public.firm_config_team_safe
  FOR SELECT
  TO authenticated
  USING (firm_id = public.current_firm_id());

REVOKE ALL ON TABLE public.firm_config_team_safe FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.firm_config_team_safe TO authenticated;
GRANT ALL ON TABLE public.firm_config_team_safe TO service_role;
