
-- ============ ENUMS ============
create type public.user_role as enum ('principal', 'admin', 'team', 'view_only');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type public.subscription_tier as enum ('foundation', 'studio', 'practice');
create type public.project_status as enum ('active', 'pipeline', 'completed', 'on_hold');
create type public.expense_frequency as enum ('annual', 'monthly', 'quarterly', 'onetime');
create type public.scope_risk as enum ('low', 'medium', 'high');

-- ============ FIRMS ============
create table public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  subscription_status public.subscription_status not null default 'trialing',
  subscription_tier public.subscription_tier not null default 'foundation',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- ============ PROFILES (extends auth.users) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  firm_id uuid references public.firms(id) on delete cascade,
  role public.user_role not null default 'team',
  name text not null default '',
  email text not null,
  color text not null default '#B8860B',
  billable_rate numeric(10,2),
  cost_rate numeric(10,2),
  expected_hrs_per_week numeric(5,2),
  weeks_per_year numeric(4,1),
  billable_pct numeric(5,2),
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_firm_id_idx on public.profiles(firm_id);

-- ============ SECURITY DEFINER HELPERS ============
create or replace function public.current_firm_id()
returns uuid language sql stable security definer set search_path = public as $$
  select firm_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_firm_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('principal','admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_firm_principal()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'principal' from public.profiles where id = auth.uid()), false)
$$;

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ FIRM CONFIG ============
create table public.firm_config (
  firm_id uuid primary key references public.firms(id) on delete cascade,
  rate_billed numeric(10,2),
  target_billable_hrs_per_week numeric(5,2),
  target_gross_margin_pct numeric(5,2),
  comp_draw_annual numeric(12,2),
  comp_ptax_pct numeric(5,2),
  comp_health_annual numeric(12,2),
  comp_retire_annual numeric(12,2),
  available_hrs_per_week numeric(5,2),
  actual_billed_rate numeric(10,2),
  updated_at timestamptz not null default now()
);

-- ============ EXPENSES ============
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  frequency public.expense_frequency not null,
  amort_months integer,
  category text,
  recurring boolean not null default true,
  created_at timestamptz not null default now()
);
create index expenses_firm_id_idx on public.expenses(firm_id);

-- ============ ACTIVITY GROUPS ============
create table public.activity_groups (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  color text not null default '#B8860B',
  created_at timestamptz not null default now()
);
create index activity_groups_firm_id_idx on public.activity_groups(firm_id);

-- ============ SOP TEMPLATES ============
create table public.sop_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  category text,
  department text,
  description text,
  tags text[],
  triggered_by text,
  done_when text,
  scope_risk_level public.scope_risk default 'low',
  common_failure_modes text,
  created_at timestamptz not null default now()
);
create index sop_templates_firm_id_idx on public.sop_templates(firm_id);

create table public.sop_phases (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.sop_templates(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  expected_hrs numeric(8,2) not null default 0,
  billable boolean not null default true,
  sort_order integer not null default 0,
  description text,
  time_benchmark_notes text
);
create index sop_phases_template_idx on public.sop_phases(template_id);
create index sop_phases_firm_idx on public.sop_phases(firm_id);

create table public.sop_steps (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.sop_phases(id) on delete cascade,
  description text not null,
  sort_order integer not null default 0
);
create index sop_steps_phase_idx on public.sop_steps(phase_id);

-- ============ PROJECTS ============
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  client_name text,
  status public.project_status not null default 'active',
  sop_template_id uuid references public.sop_templates(id) on delete set null,
  scoped_hrs numeric(10,2),
  scoped_rate numeric(10,2),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);
create index projects_firm_idx on public.projects(firm_id);

create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sop_phase_id uuid references public.sop_phases(id) on delete set null,
  name text not null,
  expected_hrs numeric(8,2) not null default 0,
  actual_hrs numeric(8,2) not null default 0,
  billable boolean not null default true,
  sort_order integer not null default 0
);
create index project_phases_project_idx on public.project_phases(project_id);

create table public.project_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (project_id, user_id)
);

-- ============ TIME ENTRIES ============
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  project_phase_id uuid references public.project_phases(id) on delete set null,
  activity_group_id uuid references public.activity_groups(id) on delete set null,
  date date not null,
  start_time time,
  end_time time,
  hrs numeric(6,2) not null default 0,
  billable boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index time_entries_firm_user_date_idx on public.time_entries(firm_id, user_id, date);
create index time_entries_project_idx on public.time_entries(project_id);

-- ============ PIPELINE ============
create table public.pipeline_projects (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  estimated_hrs numeric(10,2),
  estimated_start date,
  probability_pct numeric(5,2),
  assigned_user_ids uuid[],
  created_at timestamptz not null default now()
);
create index pipeline_projects_firm_idx on public.pipeline_projects(firm_id);

-- ============ TEAM INVITATIONS ============
create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  email text not null,
  role public.user_role not null default 'team',
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  token text not null default encode(gen_random_bytes(24), 'hex'),
  unique (firm_id, email)
);
create index team_invitations_firm_idx on public.team_invitations(firm_id);

-- ============ GRANTS ============
grant select, insert, update, delete on public.firms to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.firm_config to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.activity_groups to authenticated;
grant select, insert, update, delete on public.sop_templates to authenticated;
grant select, insert, update, delete on public.sop_phases to authenticated;
grant select, insert, update, delete on public.sop_steps to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_phases to authenticated;
grant select, insert, update, delete on public.project_assignments to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.pipeline_projects to authenticated;
grant select, insert, update, delete on public.team_invitations to authenticated;
grant all on all tables in schema public to service_role;

-- ============ RLS ============
alter table public.firms enable row level security;
alter table public.profiles enable row level security;
alter table public.firm_config enable row level security;
alter table public.expenses enable row level security;
alter table public.activity_groups enable row level security;
alter table public.sop_templates enable row level security;
alter table public.sop_phases enable row level security;
alter table public.sop_steps enable row level security;
alter table public.projects enable row level security;
alter table public.project_phases enable row level security;
alter table public.project_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.pipeline_projects enable row level security;
alter table public.team_invitations enable row level security;

-- FIRMS
create policy firms_select on public.firms for select to authenticated
  using (id = public.current_firm_id());
create policy firms_insert on public.firms for insert to authenticated
  with check (owner_id = auth.uid());
create policy firms_update on public.firms for update to authenticated
  using (id = public.current_firm_id() and public.is_firm_principal())
  with check (id = public.current_firm_id());

-- PROFILES
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or firm_id = public.current_firm_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin());
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- FIRM_CONFIG
create policy firm_config_select on public.firm_config for select to authenticated
  using (firm_id = public.current_firm_id());
create policy firm_config_write on public.firm_config for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

-- Generic helper macro pattern repeated:
-- Read: same firm. Write: admin.
create policy expenses_select on public.expenses for select to authenticated using (firm_id = public.current_firm_id());
create policy expenses_write on public.expenses for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

create policy ag_select on public.activity_groups for select to authenticated using (firm_id = public.current_firm_id());
create policy ag_write on public.activity_groups for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

create policy sopt_select on public.sop_templates for select to authenticated using (firm_id = public.current_firm_id());
create policy sopt_write on public.sop_templates for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

create policy sopp_select on public.sop_phases for select to authenticated using (firm_id = public.current_firm_id());
create policy sopp_write on public.sop_phases for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

create policy sops_select on public.sop_steps for select to authenticated
  using (exists (select 1 from public.sop_phases p where p.id = phase_id and p.firm_id = public.current_firm_id()));
create policy sops_write on public.sop_steps for all to authenticated
  using (public.is_firm_admin() and exists (select 1 from public.sop_phases p where p.id = phase_id and p.firm_id = public.current_firm_id()))
  with check (public.is_firm_admin() and exists (select 1 from public.sop_phases p where p.id = phase_id and p.firm_id = public.current_firm_id()));

create policy projects_select on public.projects for select to authenticated using (firm_id = public.current_firm_id());
create policy projects_write on public.projects for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

create policy project_phases_select on public.project_phases for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.firm_id = public.current_firm_id()));
create policy project_phases_write on public.project_phases for all to authenticated
  using (public.is_firm_admin() and exists (select 1 from public.projects p where p.id = project_id and p.firm_id = public.current_firm_id()))
  with check (public.is_firm_admin() and exists (select 1 from public.projects p where p.id = project_id and p.firm_id = public.current_firm_id()));

create policy pa_select on public.project_assignments for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.firm_id = public.current_firm_id()));
create policy pa_write on public.project_assignments for all to authenticated
  using (public.is_firm_admin() and exists (select 1 from public.projects p where p.id = project_id and p.firm_id = public.current_firm_id()))
  with check (public.is_firm_admin() and exists (select 1 from public.projects p where p.id = project_id and p.firm_id = public.current_firm_id()));

-- TIME ENTRIES: team can see/edit own; admin sees all
create policy time_entries_select on public.time_entries for select to authenticated
  using (firm_id = public.current_firm_id() and (public.is_firm_admin() or user_id = auth.uid() or public.current_user_role() = 'view_only'));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (firm_id = public.current_firm_id() and (public.is_firm_admin() or user_id = auth.uid()));
create policy time_entries_update on public.time_entries for update to authenticated
  using (firm_id = public.current_firm_id() and (public.is_firm_admin() or user_id = auth.uid()))
  with check (firm_id = public.current_firm_id() and (public.is_firm_admin() or user_id = auth.uid()));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (firm_id = public.current_firm_id() and (public.is_firm_admin() or user_id = auth.uid()));

create policy pipeline_select on public.pipeline_projects for select to authenticated using (firm_id = public.current_firm_id());
create policy pipeline_write on public.pipeline_projects for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());

create policy invites_select on public.team_invitations for select to authenticated using (firm_id = public.current_firm_id());
create policy invites_write on public.team_invitations for all to authenticated
  using (firm_id = public.current_firm_id() and public.is_firm_admin())
  with check (firm_id = public.current_firm_id() and public.is_firm_admin());
