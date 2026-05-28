# Architectural Audit — Findings & Fix Plan

Reviewed each section against the current build. Most of the data layer is already correct. Implementing only the gaps below.

## 1. Supabase as single source of truth — PASS, no changes

Every business entity (`firm_config`, `time_entries`, `projects`, `project_phases`, `sop_*`, `activity_groups`, `pipeline_projects`, `knowledge_base_items`, `webhook_log`) is read/written via `createServerFn` handlers in `src/lib/*.functions.ts` against Supabase. `useState` in route files is scoped to form drafts, dialog open/close, selected tab — which the spec explicitly permits. No migration needed.

## 2. RLS audit — PASS with two tiny adds

Every table in the schema has RLS enabled with firm-scoped policies. Existing helpers `current_firm_id()`, `current_user_role()`, `is_firm_admin()`, `is_firm_principal()`, `is_super_admin()` already cover the spec's intent (the spec's `get_user_firm_id` / `get_user_role` names are aliases of what's there).

Two small deltas to add in a single migration:

- **`get_user_firm_id()` and `get_user_role()` SECURITY DEFINER alias functions** so any future code matching the spec's naming works. Thin wrappers around the existing helpers.
- **`knowledge_base_items.kbi_read` tier filter**: current policy is `status='published' OR is_super_admin()`. Tighten to also require `tier_visibility @> ARRAY[(firm tier)]` so foundation firms don't see practice-only content. Use a SECURITY DEFINER `current_firm_tier()` helper.

`webhook_log` is already locked to `is_super_admin()` only, which matches "server-side only" (admin client/service role bypasses RLS).

## 3. Atomic time-entry write — PARTIAL, fix it

`saveTimeEntry` in `src/lib/time.functions.ts` already inserts the row then calls `recomputePhaseActual` — but it's two sequential statements, not atomic, and there's no `phase_over_scope` flag.

This stack uses TanStack server functions (NOT Supabase Edge Functions — per the project rules). The atomic guarantee belongs in Postgres.

Changes:
- Migration: add column `project_phases.phase_over_scope boolean NOT NULL DEFAULT false`.
- Migration: create SECURITY DEFINER RPC `public.save_time_entry(p_entry jsonb)` that runs inside one transaction: INSERT into `time_entries`, recompute `actual_hrs` SUM for the phase, set `phase_over_scope = (actual_hrs > expected_hrs)`, RETURN the inserted row. Enforces `firm_id = current_firm_id()` and admin-or-self.
- `src/lib/time.functions.ts`: switch `saveTimeEntry` to `supabase.rpc('save_time_entry', ...)`. Keep update/delete paths but route their phase recompute through the same SECURITY DEFINER helper.

## 4. Realtime subscriptions — MISSING, add three

`rg "supabase.channel"` returns zero matches. Adding:

- **`/time-calendar`** (`time-calendar.tsx`): subscribe to `time_entries` filtered by `firm_id=eq.<id>` (and `user_id=eq.<uid>` when role is `team`). On INSERT/UPDATE/DELETE → `queryClient.invalidateQueries(['calendar', weekStart])`.
- **`/dashboard`** (`dashboard.tsx`): subscribe to `firm_config` and `expenses` filtered by `firm_id`. On change → invalidate `['dashboard']`.
- **`/sightline` project detail** (`sightline.tsx`): subscribe to `project_phases` filtered by `project_id`. On UPDATE → invalidate project query.

Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries, public.firm_config, public.expenses, public.project_phases;` (skip ones already added).

Implementation: small `useRealtimeInvalidate(channel, filter, queryKeys)` hook in `src/hooks/use-realtime-invalidate.ts`, called from the three components. Cleans up on unmount.

## 5. Routing — split tabs into routes

Current routes are flat (`/dashboard`, `/time-calendar`, `/sightline`, `/sop-library`, `/rate-architecture`, `/growth-roadmap`, `/knowledge-base`, `/settings`, `/admin`, `/onboarding`, `/billing`). Spec requires nested sub-routes and a few renames.

Approach: add new route files alongside existing ones (no rewrites of working pages). Each new route does `loader: () => redirect(...)` to its real implementation if the page already exists, OR is a thin wrapper that renders the matching tab section. Specifically:

| Required | Action |
|---|---|
| `/dashboard` | exists |
| `/dashboard/rate` | new file → renders the rate-architecture page content (extract to shared component, import in both `/rate-architecture` and `/dashboard/rate`) |
| `/dashboard/bva`, `/dashboard/health`, `/dashboard/scenarios` | new route files rendering the existing dashboard sections as standalone pages (extract section components from `dashboard.tsx`) |
| `/dashboard/growth` | new wrapper → renders growth-roadmap component |
| `/dashboard/knowledge` | new wrapper → renders knowledge-base component |
| `/setup` | new route → redirects to `/onboarding` (or renders settings firm-config section) |
| `/calendar` | new route → renders the `time-calendar` component |
| `/projects` | new route → list view (currently inside `/sightline`) — extract list to component |
| `/projects/$id` | new route → project detail (currently inside `/sightline`) |
| `/sop-library` | exists |
| `/sop-library/new` | new route → "new SOP" form (currently a dialog in sop-library) |
| `/sop-library/$id` | new route → SOP detail (currently a dialog) |
| `/settings`, `/admin` | exist |

Each new route file calls its server fn loader fresh on mount (TanStack default).

## 6. Cross-module flows — verified after the above

- **Flow 1** (time entry → dashboard KPIs): fixed by §4 realtime on `time_entries`/`firm_config`/`expenses`.
- **Flow 2** (time entry → project phase actual_hrs + scope warning): fixed by §3 atomic RPC + `phase_over_scope` column. Sightline already reads `actual_hrs`/`expected_hrs`; add the warning badge when `phase_over_scope=true`.
- **Flow 3** (firm_config change → aligned rate updates everywhere): fixed by §4 realtime on `firm_config`.

## Files touched

**New migrations** (one combined):
- alias functions `get_user_firm_id`, `get_user_role`, `current_firm_tier`
- tighten `kbi_read`
- add `project_phases.phase_over_scope`
- create `save_time_entry(jsonb)` RPC
- extend `supabase_realtime` publication

**New code:**
- `src/hooks/use-realtime-invalidate.ts`
- `src/routes/_authenticated/dashboard.rate.tsx`, `dashboard.bva.tsx`, `dashboard.health.tsx`, `dashboard.scenarios.tsx`, `dashboard.growth.tsx`, `dashboard.knowledge.tsx`
- `src/routes/_authenticated/setup.tsx`, `calendar.tsx`, `projects.tsx`, `projects.$id.tsx`
- `src/routes/_authenticated/sop-library.new.tsx`, `sop-library.$id.tsx`

**Edited (minimal):**
- `src/lib/time.functions.ts` → call RPC
- `src/routes/_authenticated/time-calendar.tsx`, `dashboard.tsx`, `sightline.tsx` → add realtime hook
- `src/routes/_authenticated/sightline.tsx` → show over-scope badge
- Possibly extract a couple of section components from `dashboard.tsx` / `sightline.tsx` / `sop-library.tsx` into shared components used by both old and new routes (no behavior change to the originals)

## Explicitly NOT changing
- Visual design, component structure, copy
- Auth flow, super admin impersonation, tier gating
- Any currently-working server function or RLS policy