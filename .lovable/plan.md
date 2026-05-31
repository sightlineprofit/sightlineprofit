# Implementation Plan

Large 4-part change. Will ship in one batch with one migration, but listed in sequence so progress is clear.

## Part 1 — Business Reserve Target dropdown (Settings → S-Corp/Advanced comp)

- Replace single `comp_reserve_target_annual` number input with:
  - Mode select: 1 / 2 / 3 / 6 / 12 months of OpEx, or Custom amount
  - When months mode: compute `annual_opex_total / 12 * months` from `expenses` (normalize each row to annual based on `frequency`/`amort_months`, then divide). Show "3 mo × $X/mo = $Y".
  - When custom: number input as today.
- Persist as: keep `comp_reserve_target_annual` as the resolved dollar value (so finance.ts is unaffected). Add new `comp_reserve_mode` (text: `months_1|months_2|months_3|months_6|months_12|custom`) on `firm_config` so the UI can re-render the right control and auto-recompute on save when OpEx changes.
- Add InfoTip with the requested copy.

## Part 2 — Team setup: editable, hourly vs salaried, true burdened cost

Schema additions on `profiles`:
- `compensation_type` text default `'hourly'` (`'hourly'|'salaried'`)
- `annual_base_salary` numeric
- `employer_payroll_tax_pct` numeric default 7.65
- `annual_benefits` numeric
- `other_annual_costs` numeric
- `burdened_hourly_rate` numeric (stored)
- `burdened_weekly_cost` numeric (stored)

UI in `settings.tsx` Team section:
- Each member row gets an Edit button → inline/dialog form pre-filled with current values; Save/Cancel.
- Comp type radio. Hourly → existing `cost_rate`. Salaried → hide cost rate, show salary/ptax/benefits/other inputs.
- Live "Fully burdened" breakdown panel (yr / wk / hr) using formulas in spec.
- InfoTip on burdened cost.
- On save: server fn recomputes burdened fields and stores them. Same recompute when `expected_hrs_per_week` / `weeks_per_year` change.

Wire-through:
- Capacity tile, calendar team selector, dashboard utilization already read from `profiles` — confirmed they pick up updates via React Query invalidation. Pending invites: include `team_invitations` rows that haven't accepted in the team-pickers so they appear immediately (planned-hours only, no time entries).

## Part 3 — Time Calendar entry improvements (`time-calendar.tsx`)

Calendar blocks:
- Render 3 lines (client · project / activity / duration · billable). Truncate by available height. Tooltip with full details including phase + notes.

Entry modal:
- Rename "Phase" field to "Activity"; bind to `activity_group_id` dropdown (already exists — re-label and reorder).
- New collapsible "Link to project task (optional)" below activity. Expanded shows phase list grouped by phase; search input when >8 phases. Selecting writes `project_phase_id`. Tag chip shows selection when collapsed.
- Project dropdown: prepend a `── Firm ──` group with one item per activity group (BD, Internal, Training, etc.). Selecting one sets `project_id=null`, `activity_group_id=<that group>`, `billable=false` by default.

No schema changes; uses existing columns.

## Part 4 — Team Calendar view redesign

In `time-calendar.tsx` team view (admins only):
- Add `[Overview] [Calendar]` sub-toggle.
- Overview = current behavior (kept as-is).
- Calendar mode:
  - Member filter pills row (All + each member, with color dot).
  - When multiple selected: shared week grid; each day column subdivides into per-member sub-columns; blocks use the member's color. Vertical stack on time overlap within a member column.
  - When exactly one selected: full-width per-member week (mirrors solo view) with full block detail.
- Week summary table always rendered below.

## Technical notes

- One migration: `firm_config.comp_reserve_mode` + `profiles` burdened-cost columns.
- `firm.functions.ts`: extend `upsertFirmConfig` payload schema; add `updateTeamMember` server fn that accepts all comp fields, computes burdened values, and writes them.
- `finance.ts`: `calc()` continues to read `comp_reserve_target_annual` directly (resolved value), so no math change needed. Capacity / utilization use `burdened_weekly_cost` when present, falling back to `cost_rate * expected_hrs_per_week`.
- `time.functions.ts`: include `activity_groups` (already done) and `team_invitations` pending list in `getCalendarData` so unaccepted invites show up.
- Strict frontend-only for view changes; schema + server fns required only for the parts above.

## Out of scope

- No changes to billing flow, RLS posture, or scoped/actual hour math.
- No changes to phase-card UI on Sightline.
- No new tables.
