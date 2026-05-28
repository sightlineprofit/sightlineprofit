This is a large multi-screen build. Confirming scope before I start so I don't rebuild anything currently working.

## What already exists (will NOT rebuild)

- `firm_config` and `expenses` tables with RLS — reused as-is
- `save_time_entry` RPC with atomic `phase_over_scope` write — reused
- `useRealtimeInvalidate` hook — reused for all live updates
- Dashboard tiles and finance computations in `src/lib/finance.ts` / `dashboard.functions.ts` — reused
- Activity Groups tab in `/settings` — keep, just add color-picker polish if needed
- SOP library + `sop_templates/phases/steps` — reused as snapshot source
- `/calendar` redirect, `/setup` redirect, `/projects` redirect — will be REPLACED with real pages
- Tier gating already bypassed for super admin — untouched

## Part 1 — `/setup` (Rate & Cost Architecture)

New route `src/routes/_authenticated/setup.tsx` (replacing the redirect). Two-panel layout:

**Left (scrollable, pill toggle between 3 sections):**
1. Owner Compensation — annual salary, SE tax %, health, retirement → writes `firm_config.comp_*`
2. Operating Expenses — inline-add list (name, amount, frequency, amortize months, category), recurring/one-time badges, contribution split bar → CRUD on `expenses`
3. Capacity & Rate — available hrs/wk, target billable hrs/wk, target gross margin %, billed rate → writes `firm_config.available_hrs_per_week`, `target_billable_hrs_per_week`, `target_gross_margin_pct`, `rate_billed`. Shows live aligned-rate formula breakdown.

**Right (sticky):** Aligned Rate, Billed Rate, Margin Above Floor (+ day/week/month/year toggle), Break-Even Rate, Annual Cost Floor, Utilization Target, Budget Revenue. Each with InfoTip.

**Persistence:** debounced 800ms autosave per field via existing `updateFirmConfig` / new `upsertExpense` / `deleteExpense` server fns. No save button for computed fields. Realtime subscription on `firm_config` + `expenses` keeps right panel and dashboard in sync.

**New server fns** in `src/lib/setup.functions.ts`: `getSetup`, `saveFirmConfig` (extend existing if present), `upsertExpense`, `deleteExpense`.

## Part 2 — Projects

**`/projects`** (`projects.tsx`, replacing redirect): header + "New Project", filter pills (All / Active / Pipeline / Completed / On Hold), card grid with status badge, scoped hrs, actual hrs, phase health dot (green/amber/red derived from `project_phases.phase_over_scope` + 80% threshold), billable/non-billable split. Empty state with single CTA.

**`/projects/new`**: 3-step wizard (Details → SOP attach → Review). SOP attach copies `sop_phases` rows into `project_phases` as a snapshot (no FK link beyond informational `sop_phase_id` already present).

**`/projects/$id`** (replacing redirect): inline-editable header, phase breakdown table with variance hrs/$, % consumed, status badge, add/edit/delete phase rows, "Add from SOP Library" picker for individual phases. Scope Creep panel (only when any `phase_over_scope`). Profitability summary 4-quadrant (scoped vs actual revenue/cost/margin/margin%). Time entry log filterable by assignee/phase/date/billable. Assign team members section (uses existing `project_assignments` table).

**New server fns** in `src/lib/projects.functions.ts`: `listProjects`, `createProject` (with optional SOP snapshot copy), `getProject` (joins phases + time entries + assignments + profitability), `updateProject`, `upsertPhase`, `deletePhase`, `assignMember`, `unassignMember`.

**Realtime:** subscribe `projects`, `project_phases`, `time_entries` filtered by project on detail page.

## Part 3 — Data connectivity enforcement

Already in place from prior turn: `useRealtimeInvalidate` on `time_entries`/`firm_config`/`expenses`/`project_phases`. I will verify and add any missing subscription on the new screens. The `save_time_entry` RPC already handles atomic `phase_over_scope`. SOP-to-project snapshot independence enforced by copying rows (no triggers/FKs propagating edits).

Profitability computation lives in `getProject` server fn: joins time_entries with assignee `cost_rate` from `profiles` to compute actual_cost; uses `project.scoped_rate` × billable hrs for actual_revenue.

## Part 4 — Roles tab in `/settings`

Currently `profiles` carries `cost_rate`, `billable_rate`, `billable_pct`. There is no separate "firm roles" table. Two options:

- **A. Lightweight:** Treat existing per-user fields as the source of truth and rename the tab "Team Rates" — already covered by the Team tab.
- **B. New `firm_roles` table** (name, cost_rate, billable_by_default) + add `role_id` FK on `time_entries` and `profiles.firm_role_id`. This is a schema + migration change touching time entry forms.

The spec describes B (firm-level role list with cost rates driving `actual_cost`). I'll implement B as a new migration: `firm_roles` table with RLS, add `firm_role_id` nullable column to `time_entries` and `profiles`, populate role dropdown in the time entry form, fall back to assignee's `cost_rate` when no role is selected so existing data keeps working.

Activity Groups tab already exists — I'll add the Active/Inactive toggle column (new `is_active` boolean default true) and surface defaults as a "Suggested" panel with one-click add buttons (not auto-inserted, per spec).

## File plan

**New routes:**
- `src/routes/_authenticated/setup.tsx` (replaces redirect)
- `src/routes/_authenticated/projects.tsx` (replaces redirect — list)
- `src/routes/_authenticated/projects.new.tsx`
- `src/routes/_authenticated/projects.$id.tsx` (replaces redirect — detail)

**New server fn modules:**
- `src/lib/setup.functions.ts`
- `src/lib/projects.functions.ts`
- `src/lib/roles.functions.ts`

**Edited:**
- `src/routes/_authenticated/settings.tsx` — add Roles tab + Activity active toggle + suggestions panel
- `src/lib/firm.functions.ts` — minor extension only if needed

**Migration:**
- `firm_roles` table + grants + RLS
- `time_entries.firm_role_id`, `profiles.firm_role_id` nullable columns
- `activity_groups.is_active` boolean default true
- Extend `supabase_realtime` to `projects`, `project_assignments`, `firm_roles`

**Not touching:** AppShell, super-admin impersonation, tier gates, auth, dashboard tile components, SOP library UI, calendar UI shell, finance.ts math (just calling it), the bypass routes once replaced.

## Confirm before I start

This is roughly 12-15 new/edited files plus one migration. Approve and I'll execute in order: migration → server fns → setup screen → projects screens → settings Roles tab → verify connectivity.
