## Bug: Step 6 checklist gets stuck after "Create project + attach SOP"

### Root cause

In `src/components/tour/TourProvider.tsx` (Step 6), the "Attach an SOP workflow" checkmark only ticks when a Supabase Realtime `INSERT` event fires on `project_phases`.

But the wizard creates the project **and** its phases in a single `createProject` server call. The tour only subscribes to the `project_phases` channel *after* `projectId` is set (which happens when the project-created event arrives) — the phase INSERTs have already happened by then, and `public.project_phases` may not even be in the realtime publication. So `sopAttached` never flips to true and Step 6 sits there waiting.

The third item "Review scoped hours" adds another gate (open the project detail, wait 3s) that the user shouldn't have to satisfy.

### Fix

1. **Signal SOP attach from the wizard** (`ProjectSetupWizard.tsx`)
   - After `createProject` succeeds, if the created project has phases (i.e. `phases.length > 0` or an SOP template was chosen), dispatch a new `sightline:sop-attached` CustomEvent with `{ id }` right after the existing `sightline:project-created` event.

2. **Listen for the event in Step 6** (`TourProvider.tsx`)
   - Add a `window.addEventListener("sightline:sop-attached", …)` effect that sets `sopAttached = true` (and captures projectId if not already set). Keep the existing realtime subscription as a fallback for the case where the user attaches an SOP later from the project detail panel.

3. **Remove "Review scoped hours"**
   - Delete the `scopeReviewed` state, its effect (the `/sightline?openProject=…` + `sightline:project-opened` listener), and the third `item(...)` row.
   - Simplify `allDone` to `projectCreated && sopAttached`.
   - Auto-advance effect becomes `if (projectCreated && sopAttached) → onAdvance()` after ~800ms.
   - Drop the "Skip to Step 7" button (auto-advance covers it) or keep as an immediate-advance fallback — I'll keep it, relabeled "Continue →", visible once both items are done.
   - Update the progress dots comment ("STEP 6 OF 7") copy stays; only the checklist shrinks from 3 to 2 items.

### Files touched

- `src/components/tour/TourProvider.tsx` — remove `scopeReviewed`, update effects, checklist, button.
- `src/components/projects/ProjectSetupWizard.tsx` — dispatch `sightline:sop-attached` alongside `sightline:project-created` on successful creation when phases exist.

### Out of scope

No backend/schema changes. No changes to the wizard's create logic, payment flow, or other tour steps.
