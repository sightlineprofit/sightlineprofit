
## Scope

Expand the **existing** dashboard Capacity tile in `src/routes/_authenticated/dashboard.tsx`. No new route, no schema changes, no rebuilds of unrelated tiles. Sidebar already has no `/capacity` entry, so nothing to remove.

## Files touched

- `src/routes/_authenticated/dashboard.tsx` — replace `CapacityPreview` + `CapacityFull` with new components.
- `src/lib/dashboard.functions.ts` — extend `getDashboardData` to return the extra capacity payload (projects with phases, pipeline rows, last-4-weeks non-billable, SOP template totals).
- `src/components/capacity/` (new folder) — extract sub-components to keep dashboard.tsx readable:
  - `CapacityTile.tsx` (collapsed)
  - `CapacityExpanded.tsx` (tab shell, tab memory via `sessionStorage`)
  - `tabs/OverviewTab.tsx`, `tabs/TimelineTab.tsx`, `tabs/TeamTab.tsx`
  - `WeeklyPressureChart.tsx`, `ProjectTimeline.tsx`, `OpenWindows.tsx`, `WhatIfTool.tsx`
  - `capacity-math.ts` — pure helpers (weekly committed per week, open-window detection, status thresholds, dollar potential).

## Data layer (single server fn additions)

Extend `getDashboardData` (or add `getCapacityData` called from the dashboard query) to return:

- `projects`: id, name, status, start_date, end_date, scoped_hrs, fixed_fee, scoped_rate, phases [{ expected_hrs, sort_order }]
- `pipeline`: id, name, estimated_hrs, estimated_start, probability_pct
- `team`: profiles (id, name, role, color, expected_hrs_per_week, billable_rate)
- `last4WeeksNonBillable`: sum hrs where `billable=false` over trailing 4 weeks → weekly average
- `weeklyLoggedPast`: last 8 weeks of billable hours per ISO week
- `sopTemplates`: id, name, total_hrs (sum of `sop_phases.expected_hrs`)

All RLS-respected via `requireSupabaseAuth`. No new tables, no migration.

## Calculation rules (single source — `capacity-math.ts`)

- `annualTarget = target_billable_hrs_per_week × weeksPerYear` (weeksPerYear = 48 fallback, no config field exists).
- `committed = Σ project_phases.expected_hrs` for active projects, fallback `Σ projects.scoped_hrs` when phases missing.
- `pipelineWeighted = Σ estimated_hrs × probability_pct/100`.
- `nonBillableEst = avgWeeklyNonBillable × weeksRemainingInYear`.
- `available = max(0, annualTarget − committed − pipelineWeighted − nonBillableEst)`.
- `weeklyCommitted[w]` for next 16 weeks: for each active project with dates, distribute phase `expected_hrs` evenly across project weeks (phase ordering used only when phases have explicit week spans; otherwise flat split — pragmatic fallback matching spec note). Past weeks pulled from `time_entries`.
- `weeklyPipeline[w]`: pipeline rows distributed across 8 weeks starting at `estimated_start`, scaled by probability.
- `openWindows`: contiguous spans ≥2 weeks where `weeklyCommitted < target × 0.70`; classify by avg pct (Comfortable <60, Tight 60–85, Over >85).
- Status pill thresholds drive collapsed tile color and default tab.

## Collapsed tile (Part 2)

Status pill (green/gold/terra/danger), mini 3-segment annual bar (committed gold / pipeline gold-40 / available cream), three numbers (committed hrs+%, available hrs+%, logged this week), conditional flags (member over capacity, project strains a month). One click opens expanded modal; default tab = Timeline unless Comfortable (then Overview).

## Expanded shell

Reuse the existing `FullViewDialog` (wide). Header keeps "Firm Capacity" + status pill. Tabs use shadcn `Tabs`. Active tab persisted to `sessionStorage["capacity:tab"]`.

## Overview tab (Part 4)

Keep the current planned-capacity / billable-vs-non-billable / revenue blocks. **Add**: annual capacity stacked bar with 4 segments + legend with dollar potential; four key stat blocks (Open / Committed / Pipeline / At your rate $).

## Timeline tab (Part 5) — the main work

Five sections built to the editorial spec (Cormorant Garamond for display, Jost for UI, color tokens charcoal/gold/cream/success/terra). No card outlines on section interiors.

- **A. Framing** — eyebrow, italic headline, subline, status row.
- **B. Weekly pressure chart** — custom flex-row bars (no chart lib), 16 weeks, stacked pipeline-over-committed, dashed target line, zone labels, week labels, legend.
- **C. Project timeline** — Gantt-style rows from active projects with start/end, sorted by start. Six-month window.
- **D. Open windows** — up to 3 cards generated from `openWindows`; classification colors + auto descriptions. Hidden entirely when <4 weeks forward project data.
- **E. What-if tool** — hours input + start-window select (populated from windows; "ASAP" first); result block with three states; SOP template chips below pre-fill hours.

## Team tab (Part 6)

Guarded by `RoleGuard allow={["principal","admin"]}`. Member cards (color dot, target, mini bar, this-week stats), team totals bar, utilization table with row-border classification.

## Graceful degradation (Part 7)

Implemented as branches in each component:
- No `target_billable_hrs_per_week` → all tabs replaced by single CTA card linking to `/setup`.
- Pressure chart: empty/projects-missing/phases-missing variants with inline notes.
- Project timeline: split list of dateless active projects with edit links.
- Open windows hidden when insufficient; one-line hint shown in its place.
- What-if collapses to hours-only + annual % when no windows.
- Pipeline simply absent when zero rows.

## Progressive prompts (Part 8)

Add a small `useDismissiblePrompt(key)` hook backed by `localStorage["sightline:prompt-dismissed:<key>"]` + auto-dismiss when underlying data exists. Wire the specific prompts called out in spec at: dashboard header (cost setup), BvA tile (Foundation log-hours), collapsed capacity tile (no timelines), Timeline tab (phases missing, pipeline missing), project detail (no dates / no phases), time calendar (first-week sidebar). Each prompt is one line, links to the right place, never repeats.

## Out of scope / explicitly skipped

- No new routes, no edge functions, no migrations.
- Existing BvA / Rate / Scenario / Knowledge tiles untouched.
- Sightline project-detail $-scrubbing (separate pending question) untouched.

## Verification

- Build/typecheck (auto).
- Manual: open dashboard → expand tile → check three tabs render with seed data; toggle a project's `start_date` null to confirm degradation; clear `target_billable_hrs_per_week` to confirm setup CTA.
