## Sightline — Capacity, Accounting Basis, Project Status, Comp, Allocation, Scenarios, Plain Language

This is a large interconnected change spanning schema, dashboard, scenario planning, rate architecture, and copy. Splitting into ordered phases; each phase ships together.

### Phase 1 — Schema & settings (one migration)

`supabase/migrations/<ts>_capacity_basis_status_comp.sql`:

- `firm_config`:
  - `accounting_basis text not null default 'cash'` (check `in ('cash','accrual')`)
  - `business_structure text not null default 'sole_prop'` (`sole_prop|s_corp|other`)
  - `comp_distribution_annual numeric` (S-Corp distribution, no SE tax)
  - `comp_reserve_target_annual numeric` (business reserve target)
  - `planned_activity_allocation jsonb default '{}'` (`{ activity_group_id: pct }`)
- `projects.status` enum extension: add `pursuit`, `invoiced`, `collected`. Keep `active`, `completed`. Migrate existing values where needed (leave as-is; new values just added).
  - Postgres enum: `ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'pursuit'`, same for `invoiced`, `collected`.
- New `knowledge_articles` row: featured article "Why every spending decision has a per-hour cost — and what to do with that". Inserted via `supabase--insert`, not migration.

### Phase 2 — Finance math (`src/lib/finance.ts`)

- Extend `FirmConfig` with new fields.
- `calc()`:
  - `compTotal` honors business structure:
    - sole_prop/other: `draw + ptax + health + retire` (today's behavior).
    - s_corp: `w2_salary + ptax(on salary only) + health + retire + distribution + reserve_target`. SE tax NOT applied to distribution or reserve. Salary field reuses `comp_draw_annual`.
  - Returns `marginBuffer = billedRate - alignedRate`.
- New helpers:
  - `cashRecovery({ amount, marginPerHr, billableHrsPerWeek })` → weeks/months.
  - `oneTimePerHr({ amount, months, annualBillableHrs })` → $/hr while active.
  - `marginBreakdown(grossProfitPerHr)` → tax 25%, reserve 10%, growth remainder.

### Phase 3 — Project status semantics

Server-side (`sightline.functions.ts`, `dashboard.functions.ts`, `time.functions.ts`):

- Status buckets:
  - `pursuit` → BD hours, excluded from billable utilization & revenue.
  - `active` → counts toward committed revenue + utilization + capacity.
  - `invoiced` → committed revenue; hours no longer load active capacity.
  - `collected` → revenue collected.
  - `completed` → archived; excluded from active capacity.
- Dashboard payload exposes:
  - `committed_revenue` (active + invoiced scoped/fixed)
  - `collected_revenue` (collected)
  - `actual_revenue_for_basis` (cash → collected only; accrual → invoiced+collected)
  - `bd_hours_week`
- Calendar/time-log row labels "BD time" for pursuit projects (UI-only badge).

### Phase 4 — Capacity tile (replaces Growth Roadmap on dashboard)

- Remove Growth Roadmap dashboard tile entry; route untouched.
- New `src/components/dashboard/CapacityTile.tsx`:
  - Collapsed: firm planned vs committed bar, available/committed/remaining hrs, over-capacity & over-commit warnings.
  - Full view via dialog/sheet: 4 tabs.
- New `src/lib/capacity.functions.ts`:
  - `getCapacityData()` returns members (target hrs, weeks), planned activity allocation, actual allocation aggregated from `time_entries.activity_group_id`, per-member week/month/quarter/YTD totals, active project commitments with implied hrs/week, comparisons to prior period, BD hours.
  - `simulateProjectFit({ hours, start, end, member_ids })` → outcome bucket + message data.
  - `savePlannedActivityAllocation({ map })`.
- 4 tabs implemented inline within `CapacityTile` (or in `src/components/capacity/*.tsx` for readability).

### Phase 5 — "Where Your Rate Goes" tile (replaces Cost Architecture Health)

- Remove health-ring/cost-architecture-health tile from dashboard grid.
- New `src/components/dashboard/RateAllocationTile.tsx`:
  - Collapsed: compact stacked bar (Owner Comp, Payroll/SE, Recurring, One-Time, Team Labor, Above-Floor Margin).
  - Full: full-width bar, labeled list, expiry notes per one-time expense, margin breakdown panel (Tax 25%, Reserve 10%, Growth/Disc, True available profit) with InfoTips.
- Team Labor segment computed from team members' fully-burdened cost averaged across billable hours; hidden if no team beyond owner.

### Phase 6 — Rate & Cost Architecture: Advanced compensation

- In `dashboard.rate.tsx` (rate architecture editor): add collapsible "S-Corp / Advanced compensation" `<Collapsible>` block.
  - Business structure radios.
  - Relabel salary field when S-Corp selected.
  - Distribution + reserve inputs.
  - Running total displayed; replaces draw figure in formula.
- Persist via existing `upsertFirmConfig` (extend schema).

### Phase 7 — Accounting basis

- Onboarding: insert new step after capacity, before completion, in `onboarding.tsx`.
- Settings → Firm Settings: add radio to existing settings form.
- All dashboard revenue figures use `accounting_basis` to choose actual revenue source & label.
- Add InfoTips on every revenue label (Committed / Collected / Earned).

### Phase 8 — Scenario planning intelligence

- In `dashboard.scenarios.tsx` (`ScenarioFull`):
  - Compute `marginBuffer` against current billed_rate.
  - Branch messages per scenario type (new expense, pay increase, rate override, hours override, one-time purchase with cash recovery framing).
  - "Add this to my cost architecture" commit button → writes to `expenses` (or `firm_config` for pay), then recalculates and lists active projects priced below new floor (link to projects page with filter).

### Phase 9 — Plain language for amortization

Global string replacement across UI (NOT data):
- finance.ts comments + UI labels in: scenarios page, expenses settings, rate architecture, expense forms, allocation bar.
- Inline always-visible explanation for one-time expenses (not tooltip).
- "Spread cost over (months)" replaces "Amortize over (months)".

### Phase 10 — Knowledge base article

- Insert one `knowledge_articles` row: `featured`-style (use `kb_kind='article'`, `published_at=now()`). Link from `dashboard.rate.tsx`.

### Out of scope

- Project list filter UI updates beyond the new status options (badge color + dropdown). No batch status migration of existing rows.
- Invoicing/payment tracking: only the status field drives recognition — no Stripe/AR integration.
- Real S-Corp tax calculation engine (estimates only, with InfoTips noting "confirm with your accountant").

### Risk / size

This is roughly:
- 1 migration, 1 KB-article insert
- 4 new files (CapacityTile, RateAllocationTile, capacity.functions.ts, capacity sub-components)
- Heavy edits to: dashboard.tsx, dashboard.rate.tsx, dashboard.scenarios.tsx, onboarding.tsx, settings.tsx, sightline.tsx, time-calendar.tsx, finance.ts, dashboard.functions.ts, firm.functions.ts, sightline.functions.ts
- Likely ~1500–2000 LOC changed/added across ~15 files.

Given the size, I'll execute phases in order and verify builds between major phases.
