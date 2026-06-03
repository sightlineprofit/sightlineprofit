## Growth Roadmap restructure + Growth Signals

### Scope
Restructure `/growth-roadmap` into a 2-tab layout and add a comprehensive "Growth Signals Assessment" section (12 signals) plus a hire-type recommendation. Extend the financial projection to 3/5/7 year horizons.

### Tab 1 — Hiring & Growth
Sections in order:
1. **Capacity & Utilization Snapshot** — unchanged
2. **Hiring Threshold — Financial Gate** — existing content, header relabeled only
3. **Growth Signals Assessment** — NEW (see below)
4. **Hire Scenario Builder** — existing downstream-consequences block, moved here

### Tab 2 — Financial Projection
- Existing 3-year projection table moved here
- Horizon toggle: [3 / 5 / 7 Years], default 3 (current behavior unchanged)
- For 5 & 7 yr: add rows **Cumulative revenue** and **Indicative firm value (2× revenue)** with InfoTip caveat
- 7-yr: directional-uncertainty footnote
- All compounding logic re-uses existing per-year math

### Section 3 — Growth Signals Assessment

**Composite header**: "N of 12 signals active" + progress bar + tiered interpretation (0–2 / 3–4 / 5–7 / 8+).

**Status badge component** (4 states): Active (terracotta), Watch (gold), No signal (cream/muted), Needs input (slate).

**Auto-calculated signals (A–G)** — 2-col grid:
- **A. Capacity Pressure** — count weeks in last 8 above 85% util. Reuse `weeklyBuckets` from `getGrowthData` (already present); thresholds: 4+/2–3/0–1, <4wk → needs-input.
- **B. Committed Workload Horizon** — weeks until projected crunch using active `project_phases.expected_hrs` minus actuals + weighted pipeline hrs, against team weekly capacity. Server-side calc.
- **C. Project Profit Trend** — completed projects last 12 months grouped by quarter, fee − time_cost. Declining 2+ quarters → active.
- **D. Scope Creep Rate** — completed phases sum(actual)/sum(expected) last 6 months. >125% active (flagged as discipline issue), 110–125% watch.
- **E. Revenue per Available Hour** — (collected+committed) / (team × target_hrs × weeks), 12-wk trend. Declining 8+ weeks AND util >75% → active.
- **F. Start vs Close Rate** — projects created vs marked Completed/Archived last 90d.
- **G. Time from Contract to Kickoff** — avg days between `projects.created_at` and `min(time_entries.date)`, last 6 months.

**Principal-input signals (H–L)** — sub-section "The signals only you can see":
- **H. Owner Hours Beyond Target** — number input → compared to target+20% admin.
- **I. Client Experience Under Load** — 3 sub-questions Yes/No/Sometimes.
- **J. Owner Role Split** — production hrs + leadership hrs inputs.
- **K. Pipeline Realism** — radio of last-reviewed bucket; injects current weighted pipeline count/hrs.
- **L. Market Timing** — radio: durable/growing/seasonal/uncertain (seasonal shows contractor warning).

All manual answers stored in `firm_config.growth_signals` (jsonb) and surfaced with "Last updated [date]" stamp. New server fn `saveGrowthSignals` (single jsonb upsert).

**Type-of-hire recommendation card** at bottom — applies the 5 conditional rules in spec against active signal set; renders headline + 2-sentence body + "Run a hire scenario →" button that scrolls to Section 4.

### Data layer changes

- **Migration**: add `growth_signals jsonb` column to `firm_config` (default `{}`).
- **`getGrowthData`** server fn extended to return:
  - `completedProjects`: id, fee, completed_at, time_cost (computed)
  - `completedPhases`: expected_hrs, actual_hrs, completed_at (last 6 mo)
  - `projectStartLag`: per-project days from created → first time entry (last 6 mo)
  - `projectFlow`: started/completed counts last 90d
  - `revenuePerHourSeries`: 12 weekly points
  - `growthSignals`: current jsonb value from firm_config
  - `weightedPipelineHrs`: sum(estimated_hrs × probability)
- **New server fn `saveGrowthSignals`** — merges into `firm_config.growth_signals`.

### UI structure

- Add `Tabs` (shadcn) wrapper at top of `GrowthRoadmap` component.
- Extract existing JSX into `<HiringGrowthTab>` and `<FinancialProjectionTab>` local components in the same file to keep diff manageable.
- New `<GrowthSignalsSection>` component lives in the same file (large but cohesive). Uses `<SignalCard>` and `<StatusBadge>` helpers.
- Horizon toggle is local `useState`; projection rendering loops to N years.

### Out of scope (not touched)
- Existing capacity snapshot, financial gate calculation, hire scenario builder math, existing 5-signal readiness panel (kept inside Section 2 as before).
- Dashboard, Sightline, SOP library.

### Files touched
- `supabase/migrations/<new>.sql` — add jsonb column
- `src/lib/growth.functions.ts` — extend getGrowthData, add saveGrowthSignals
- `src/routes/_authenticated/growth-roadmap.tsx` — tabs + Section 3 + horizon toggle
- `src/integrations/supabase/types.ts` — regenerated after migration
