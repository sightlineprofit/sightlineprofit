## Findings

**Bug A — Onboarding compensation not carried over to Settings**

- `TourProvider.Step1Compensation` (`src/components/tour/TourProvider.tsx`) already writes to *both* `firm_config` (via `upsertFirmConfig`) *and* `owner_compensation` (via `upsertOwnerCompensation`) — but the `owner_compensation` write is wrapped in `try/catch` that swallows failures.
- Users who completed onboarding **before** that dual-write was added only have `firm_config` rows; Settings → Compensation reads exclusively from `owner_compensation`, so their card shows empty.
- Even for new users, if the `owner_compensation` upsert silently fails (permission, schema mismatch, missing profile row), we advance the tour without notice.

Root cause of the *user-visible* symptom for Indigo: her onboarding predates the dual-write, so nothing lives in `owner_compensation` for her. There is no automatic backfill.

**Bug B — Rate Architecture "Understand my numbers" Layer 01 is missing Distributions**

`src/routes/_authenticated/rate-architecture.tsx` (`UnderstandTab`, lines 185–203) builds Layer 01 line items from `owner_compensation` but only emits four rows: draw, self-employment tax, health, retirement. `distribution_annual` is omitted, while `l1Total = c.compTotal` (from `finance.ts`) *does* include distributions + reserve target. That's why the screenshot shows rows summing to $81,680 but a total of $141,680.

The `firm_config` fallback branch has the same omission (no `c.distribution` row, no `c.reserveTarget` row).

**Bug C — Insight panel still opens on hover**

`InfoTip.tsx` was converted to a click-only Radix Popover, but the ⓘ icons on dashboard tiles (Cost floor, Break-even, Aligned rate, Margin, Budget revenue) render `MetricBreakdown` (`src/components/dashboard/MetricBreakdown.tsx`), which still uses `onMouseEnter`/`onMouseLeave` with scheduled open/close timers (lines ~880–946). This is what the user sees on `/dashboard` — the dark cost-floor popover in screenshot 3.

`AlignedRateBreakdown.tsx` has the same hover pattern.

## Plan

### 1. Fix Layer 01 line items (Bug B)

In `src/routes/_authenticated/rate-architecture.tsx`, add the missing rows so the items reconcile to `l1Total`:

- `owner_compensation` branch: after the retirement row, push `Distributions` (`r.distribution_annual`) when > 0. For S-Corp firms, also push `Cash reserve target` when the calc contributes one (mirror the S-Corp guard in `finance.ts`).
- `firm_config` fallback: add `Distributions` (`c.distribution`) and `Cash reserve target` (`c.reserveTarget`) rows when > 0.

Order: draw → SE tax → distributions → health → retirement → reserve.

### 2. Convert dashboard insight popovers to click-only (Bug C)

In `src/components/dashboard/MetricBreakdown.tsx`:
- Remove the `onMouseEnter={schedOpen}` / `onMouseLeave={schedClose}` handlers on the wrapper `<span>` and on the popover `<div>`.
- Keep the button's `onClick` toggle (already implemented).
- Keep the existing outside-click, Escape, and one-at-a-time (`metric-popover-open` event) behavior.
- Delete the now-unused `schedOpen`/`schedClose`/`openT`/`closeT` timer refs and helpers (or leave `clearT` for the single click-toggle case if simpler).

Same conversion in `src/components/dashboard/AlignedRateBreakdown.tsx` (remove `onMouseEnter={scheduleOpen}` / `onMouseLeave` on the wrapper and inner panel; keep click toggle).

Radix `Popover` (`InfoTip.tsx`) already handles auto-flip right → left → bottom via `avoidCollisions` + `collisionPadding`. `MetricBreakdown` uses a hand-rolled absolute-positioned panel with a `side="left"|"right"` prop; leaving that placement logic alone is fine — the fix is strictly the trigger, not the positioning.

### 3. Backfill Indigo's compensation from onboarding (Bug A)

Do not change the tour code — the dual-write already exists. Instead:

- Add a one-shot server function `backfillOwnerCompensationFromFirmConfig` (in `src/lib/firm.functions.ts`) that, for the current signed-in principal:
  - reads their `firm_config` comp fields (`comp_draw_annual`, `comp_distribution_annual`, `comp_health_annual`, `comp_retire_annual`, `comp_ptax_pct`),
  - checks whether an `owner_compensation` row exists for `(firm_id, profile_id)`,
  - if not, inserts one seeded from firm_config values (including `payroll_tax_pct` from `comp_ptax_pct` or default 15.3).
- Trigger it opportunistically from the Settings → Compensation page on mount when the principal has no `owner_compensation` row *and* has non-zero comp fields in `firm_config`. Refetch after backfill so the card populates automatically.

This is a targeted, idempotent recovery: no data loss, no changes for users who already have `owner_compensation` rows.

### Out of scope

- Not touching `RateArchitectureBuilding` (knowledge-base page) — its per-layer paragraphs already summarize correctly; only the dashboard `UnderstandTab` itemizes.
- Not changing `DashboardSlideOvers` tooltips (short label tooltips, not the insight panel).
- Not changing `finance.ts` math.

## Files affected

- `src/routes/_authenticated/rate-architecture.tsx` — add distribution/reserve rows in `UnderstandTab`
- `src/components/dashboard/MetricBreakdown.tsx` — remove hover handlers
- `src/components/dashboard/AlignedRateBreakdown.tsx` — remove hover handlers
- `src/lib/firm.functions.ts` — add `backfillOwnerCompensationFromFirmConfig`
- `src/routes/_authenticated/settings.tsx` — call backfill on mount when eligible
