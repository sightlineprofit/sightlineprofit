
# Value Surfacing Moments — Implementation Plan

Five new display components surfacing the dollar value of insights Sightline already calculates. No existing math changes — purely additive UI driven by live data.

## Scope by Moment

### Moment 1 — First Aligned Rate Insight Card
- **Where**: Dashboard, below the rate allocation tile
- **Trigger**: `firm_config.aligned_rate` and `firm_config.rate_billed` both set AND `firm_config.rate_insight_shown = false`
- **DB**: Migration adds `rate_insight_shown boolean default false` to `firm_config`
- **Dismiss**: Server fn flips flag to true; card never reappears
- **Variants**: Gold (under-billing, shows annual gap cost) / Green (at-or-above floor, shows annual buffer)

### Moment 2 — Scope Warning Dollar Figure
- **Where**: Existing 80%-of-scope warning component on the project detail page
- **Change**: Append two lines under existing warning text
  - T&M: projected overage hours + unrecovered dollar value (uses current burn rate)
  - Fixed fee: projected total hours + effective rate erosion
- **Style**: Terracotta, matches existing warning text size
- **No new triggers** — piggybacks on the existing 80% threshold

### Moment 3 — Project Close Summary Modal
- **Where**: Project detail page status dropdown
- **Trigger**: User changes project status to `completed` or `archived`
- **Behavior**: Intercept status change → open modal → user confirms via "Close project" → status saves
- **Content**: Planned vs Actual vs Variance table (Fee / Hours / Effective rate / Margin) + scope creep callout
- **Secondary button**: "View full breakdown" closes modal, keeps user on page

### Moment 4 — Annual Value Summary
- **Route**: New `/dashboard/annual-summary` (full-screen page under `_authenticated`)
- **Entry points**:
  - Settings link "View your year in Sightline"
  - Auto-suggest banner on dashboard when within 7 days of firm's `created_at` anniversary
- **Server fn**: `getAnnualSummary` aggregates rate progress, project outcomes, capacity decisions, investment-vs-value
- **Sections**: Rate Progress / Project Outcomes / Capacity Decisions / Investment vs Value (with conservative-value note)

### Moment 5 — Dashboard Narrative Strip
- **Where**: Below the KPI strip on the main dashboard
- **Style**: Jost 12px/300, color #555, line-height 1.8, max-width 600px, cream bg, radius 4px, 14px/16px padding
- **Logic**: Priority order — under-target → scope pressure → over-utilized → all healthy
- **Variation**: Phrase rotation seeded by date + data hash so identical-data reloads vary wording without changing facts

## Technical Notes

**Schema changes**
```sql
ALTER TABLE firm_config ADD COLUMN rate_insight_shown boolean NOT NULL DEFAULT false;
```

**New/changed server functions**
- `dismissRateInsight()` — flips `rate_insight_shown`
- `getProjectCloseSummary(projectId)` — variance table data
- `getAnnualSummary()` — full-year aggregate (rate history requires we capture initial aligned_rate; we'll add `aligned_rate_at_signup numeric` to `firm_config`, backfill with current value for existing firms)
- Existing `getDashboardData` extended with `narrativeContext` (week billable, target, rate, active scope warnings, utilization)

**New files**
- `src/components/dashboard/RateInsightCard.tsx`
- `src/components/dashboard/NarrativeStrip.tsx`
- `src/components/projects/ProjectCloseSummary.tsx`
- `src/components/projects/ScopeOverageDetail.tsx` (or inline into existing warning)
- `src/routes/_authenticated/dashboard.annual-summary.tsx`

**Files edited**
- `src/routes/_authenticated/dashboard.tsx` — mount RateInsightCard + NarrativeStrip
- `src/routes/_authenticated/projects.$id.tsx` — extend warning, intercept status change
- `src/routes/_authenticated/settings.tsx` — add "View your year in Sightline" link
- `src/lib/dashboard.functions.ts`, `src/lib/firm.functions.ts` — new server fns
- Migration file for `rate_insight_shown` + `aligned_rate_at_signup`

**Design tokens**
- Reuse existing `--gold`, `--terracotta` (already in `styles.css`), `--cream`
- Cormorant Garamond + Jost already loaded per prior moments

**No changes to**
- Aligned-rate or burdened-rate calculations
- Existing scope warning trigger threshold
- Capacity math
- Onboarding, invitation flow, email infra

## Open Question

Moment 4's "Annualized revenue impact of any rate increase" requires comparing the aligned rate at signup vs today. For existing firms with no historical record, I'll backfill `aligned_rate_at_signup` with the current `aligned_rate` (so the first-year delta reads $0) and let it diverge naturally going forward. Confirm or tell me to handle differently.
