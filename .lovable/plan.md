# Unified team cost breakdown + opex/hr verification

## Goal

Make the per-member team-cost breakdown that already appears in the Cost Floor popover the single source used everywhere team cost is displayed, and confirm operating-expenses per-hour uses the firm's full billable capacity.

## Surfaces affected

- Cost Floor popover — Dashboard (Rate Architecture header)
- Cost Floor popover — Settings (rate panel)
- Understand my numbers → Layer 03 "What your team costs" (`rate-architecture.tsx`)

All three read the same `capacity.team` payload from `getDashboardData`, which was already widened last turn to include compensation fields (`employment_type`, `compensation_type`, `hourly_wage`, `annual_base_salary`, `employer_payroll_tax_pct`, `annual_benefits`, `other_annual_costs`, `expected_hrs_per_week`, `weeks_per_year`, `burdened_weekly_cost`). So one shared helper feeds every display and updates propagate automatically when a member is edited.

## Changes

### 1. Extract shared helper

New file `src/lib/team-cost.ts`:

- Move the `memberCostBreakdown(m)` currently defined in `MetricBreakdown.tsx` here.
- Export a `Member` type covering the fields listed above.
- Export `buildTeamCostBreakdown(members)` that filters to `role_type !== "principal"` and `burdened_weekly_cost > 0`, sorts by total desc, and returns:
  `{ id, name, role, base, baseLabel, tax, benefits, equipment, total, isW2 }[]`

### 2. Rewire the popover

- `MetricBreakdown.tsx`: remove the local `memberCostBreakdown` + local filter/sort and call `buildTeamCostBreakdown(members)` from the shared module. Rendering of each member sub-section, subtotal, and "Team cost total" row stays exactly as it is now.

### 3. Rewire Layer 03 in "Understand my numbers"

`src/routes/_authenticated/rate-architecture.tsx`:

- Delete the local `l3Items` loop.
- Add a new component `TeamLayerCard` (kept in this file, same visual language as `LayerCard`: white background, `Cormorant Garamond` title, `LAYER 03 — DELIVERY` tag, right-aligned annual total).
- Body renders one block per member:
  - Member name (Cormorant Garamond, 15px, charcoal) with role tag (uppercase 8px, muted) and colored dot.
  - Rows for each present cost component (Salary/Hourly wage, Employer payroll tax [W-2 only], Benefits contribution, Equipment & overhead) — same 4-column grid used by `LayerCard`: `label | bar | annual $ | $/hr` with terra fill for team.
  - Zero-value rows hidden. 1099 contractors never show employer tax.
  - Member subtotal row with `{First} total` label and total in terra.
- Below all members, a hairline divider and a total row `Team cost total` matching the existing Layer card total styling (annual value in Cormorant, no per-hr on the summary — the per-member rows already carry per-hr).
- Empty state (no active non-principal members): keep the existing italic "No employed team members…" line.

### 4. Operating expenses per-hour

- Confirmed with you: keep current denominator `c.annualBillableHrs = (principal target hrs/wk + Σ team expected hrs/wk) × weeks_per_year`.
- Add a short code comment in `finance.ts` above `annualBillableHrs` naming it "firm billable capacity" so future readers don't confuse it with `available_hrs_per_week`.
- Audit the three surfaces to confirm every "$X/hr" for opex divides by `c.annualBillableHrs` (not `target_billable_hrs_per_week × 48` or principal-only hours). If any stale divisor is found, replace with `c.annualBillableHrs`.

## Technical notes

- No schema changes. No calculation changes to `teamCostTotal`, `breakEvenRate`, `alignedRate`, or `annualRevenue`.
- Data source for all three surfaces is already `getDashboardData().capacity.team`; no new fetches.
- `memberCostBreakdown` math mirrors the burden formula in `saveFirmMember` (verified last turn), so the per-component sum equals `burdened_weekly_cost × weeks_per_year`, which is what `teamCostTotal` uses.
- Colors: reuse existing dashboard tokens (`TERRA`, `GOLD`, `SAGE`, `CHARCOAL`, `MUTED`, `BORDER`) — no new palette.

## Verification

- Edit a team member's salary/hourly wage in Settings → both the popover and the Understand-my-numbers Layer 03 card reflect the new base, tax, benefits, equipment, and subtotal on refresh.
- 1099 contractor rows show no employer tax row anywhere.
- Zero-value components stay hidden in both surfaces.
- Layer 03 total equals sum of member subtotals equals `c.teamCostTotal`.
- Layer 02 per-hr for every expense equals `amount / c.annualBillableHrs`.
- Solo firm (no non-principal members): popover falls back to the aggregated "Team cost" line; Layer 03 shows the empty-state italic line.
