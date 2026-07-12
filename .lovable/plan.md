## Plan: Fix Step 6 getting stuck after project + SOP setup

### Goal
Make guided onboarding Step 6 complete reliably even if the browser event or Realtime notification is missed, and stop asking users to create duplicate projects after they already created one with SOP phases.

### What I’ll change
1. **Add a durable Step 6 progress check**
   - Add a tour server function that checks the current firm’s actual data:
     - Does the firm have at least one project?
     - Does any project have attached SOP/scoped phases?
     - Return the most relevant project id.
   - This avoids depending only on temporary `window` events or Realtime inserts.

2. **Use that check when Step 6 opens/reopens**
   - In `TourProvider.tsx`, Step 6 will query the backend on mount.
   - If a project already exists, mark “Create a project” complete.
   - If that project has phases/SOP scope, mark “Attach an SOP workflow” complete.
   - If both are complete, auto-advance to Step 7.

3. **Re-check after project creation and SOP attachment**
   - Keep the existing browser events as fast-path signals.
   - After `sightline:project-created` or `sightline:sop-attached`, invalidate/refetch the durable Step 6 progress check so the UI has a reliable source of truth.

4. **Signal SOP attachment from the project detail attach flow too**
   - When phases are attached via the project detail “Add phases from SOP Library” dialog, dispatch the same `sightline:sop-attached` event and refresh Step 6 progress.

5. **Avoid duplicate-project prompting**
   - If Step 6 finds an existing project without SOP phases, show only the “Attach an SOP workflow” action for that project.
   - If it finds an existing project with phases, it will continue automatically instead of asking for another project.

### Files to update
- `src/lib/tour.functions.ts`
- `src/components/tour/TourProvider.tsx`
- `src/routes/_authenticated/sightline.tsx`

### Out of scope
- No database schema changes.
- No changes to payment, registration, or project creation business rules.