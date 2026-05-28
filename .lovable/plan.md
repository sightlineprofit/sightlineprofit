
## Scope

Four fixes across SOP Library and Sightline (the project detail screen). Nothing else changes.

Note: there is no separate `/projects/:id` route — project detail is rendered inline inside `src/routes/_authenticated/sightline.tsx` (`ProjectDetail`). Fix 4 lands there. All "View project →" links will point to `/sightline`.

---

## Fix 1 — Step-level hours roll up to phase totals

**DB migration**
- `ALTER TABLE public.sop_steps ADD COLUMN estimated_hrs numeric(10,2) NOT NULL DEFAULT 0`
- `ALTER TABLE public.project_phases` — add support for step snapshots via new table `public.project_steps`:
  - columns: `id uuid pk`, `project_phase_id uuid not null`, `description text not null`, `estimated_hrs numeric(10,2) default 0`, `actual_hrs numeric(10,2) default 0`, `sort_order int default 0`
  - GRANTs + RLS scoped through parent `project_phases`/`projects.firm_id` (mirror existing `project_phases` policies)

**Server (`src/lib/sop.functions.ts`)**
- Extend `phaseSchema.steps` with `estimated_hrs: number`.
- In `saveSopTemplate`: recompute `expected_hrs = sum(step.estimated_hrs)` whenever the phase has any steps; otherwise keep the user-entered fallback value.
- In `attachTemplateToProject` and `createProject` (sightline.functions.ts): snapshot `sop_steps` into the new `project_steps` rows under each newly created `project_phases` row.

**UI (`src/routes/_authenticated/sop-library.tsx` TemplateEditor)**
- Add an `Estimated hrs` numeric input on each step row.
- Phase header `expected_hrs` field becomes read-only and labeled "Total from steps" whenever the phase has ≥1 step with `estimated_hrs > 0`; otherwise editable fallback.
- Live-compute phase total and template total in the header/footer.

## Fix 2 — Attach-to-Project picks an existing project

**UI (`sop-library.tsx`)**
Replace the current `AttachForm` (which creates a brand-new project) with a project picker:
- Searchable combobox listing projects from `data.projects` (add to `getSopLibrary` return — it already queries `projects`, just include `name, client_name, status` in the select).
- Each option shows name + client + status badge.
- If selected project has existing `project_phases`, show inline warning "This project already has phases…".
- Confirm button: "Attach to {project name}".
- Empty state when no projects: link to `/sightline` (project list — "Create a project first →").
- On success: toast "Template attached. View project →" linking to `/sightline` and opening the project (we can navigate to `/sightline` and pass id via search param, or just navigate there).

**Server (`src/lib/sop.functions.ts`)**
- Replace `attachTemplateToProject`'s "create project" behavior with: `inputValidator` takes `{ template_id, project_id }`; snapshot phases + steps into `project_phases` / `project_steps` for the existing project (append, don't replace). Keep snapshot semantics (no FK to template phases for editing).

## Fix 3 — Precise decimal hour formatting everywhere

- Add `formatHours(hrs: number): string` to `src/lib/finance.ts`:
  ```ts
  export function formatHours(hrs: number): string {
    const n = Number(hrs) || 0;
    if (n === Math.floor(n)) return `${n} hrs`;
    return `${parseFloat(n.toFixed(2))} hrs`;
  }
  ```
- Replace all `toFixed(0)` / `toFixed(1)` hour formatting in:
  - `sop-library.tsx` (template card "Scoped hrs", editor totals, phase headers)
  - `sightline.tsx` (project list Cells "Scoped/Actual/Variance", phase rows, scope-creep panel, warnings)

## Fix 4 — Add SOP template from within project detail

**UI (`sightline.tsx` ProjectDetail phase breakdown section)**
- Add an "Add from SOP Library" button next to existing "Add Phase".
- Click opens a Sheet (slide-over) titled "SOP Library":
  - Lists firm templates (reuse `getSopLibrary` data, fetched lazily when sheet opens).
  - Search by name/category.
  - Click a template card → expand to show its phases (name, expected hrs computed from steps, total).
  - Two actions: "Attach All Phases" and "Select Individual Phases" (checkbox list → "Add Selected Phases").
  - Warning when project already has phases ("will append to existing X phases").
- On confirm: call new server fn `attachTemplatePhasesToProject({ project_id, template_id, phase_ids? })` which copies the selected `sop_phases` + their `sop_steps` into `project_phases` + `project_steps` as snapshots, appending after current max `sort_order`. Toast on success and invalidate `["sightline-detail", id]`.

**Phase reordering**
- Add drag-handle reordering to the existing project phase breakdown table. On drop, batch-update `sort_order` on `project_phases` via a new server fn `reorderProjectPhases({ project_id, ordered_ids: string[] })`. Uses `@dnd-kit/sortable` (already in deps if available — otherwise simple up/down arrow buttons as fallback, similar to existing `movePhase` pattern in SOP editor).

## Technical notes

- Hours stored as `numeric` already — keep numeric. Format only at the display boundary.
- `project_steps` table is new — full migration with GRANT + RLS in one batch.
- All "view project" deep links resolve to `/sightline` because there is no standalone project detail route (ProjectDetail is rendered inline).
- Stale `src/routes/_authenticated/projects.$id.tsx` already redirects to `/sightline`; no change needed.
- No changes to auth, billing, dashboards, or other modules.

## Files touched

- New: `supabase/migrations/<ts>_step_hours_and_project_steps.sql`
- Edit: `src/lib/finance.ts` (add `formatHours`)
- Edit: `src/lib/sop.functions.ts` (step hours; replace attach signature; new `attachTemplatePhasesToProject`)
- Edit: `src/lib/sightline.functions.ts` (snapshot steps in `createProject`; new `reorderProjectPhases`)
- Edit: `src/routes/_authenticated/sop-library.tsx` (step hours UI, project-picker attach modal, formatHours)
- Edit: `src/routes/_authenticated/sightline.tsx` (Add-from-SOP slide-over, reorder, formatHours)
