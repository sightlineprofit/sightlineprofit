## What's happening

Step 6 of the onboarding tour ("Set up your first project") is a card in
`src/components/tour/TourProvider.tsx`. Its "Create my first project →"
button does this:

```ts
const goToProjectCreate = () => navigate({ to: "/projects" as any });
```

`/projects` is just a redirect to `/sightline`. On `/sightline` the project
creation wizard only opens if the user finds and clicks the "Create project"
button on the empty-state card. From Indigo's point of view she clicked
"Create my first project →" and nothing obvious happened — she landed on a
list page and the tour card is still sitting there, so it feels stuck.

## Plan

1. **Make the tour button actually open the wizard.**
   - Change `goToProjectCreate` in `TourProvider.tsx` to navigate to
     `/sightline` with a `?new=1` (or similar) search param, instead of
     `/projects`.
2. **Auto-open the wizard on that param.**
   - In `src/routes/_authenticated/sightline.tsx`, read the `new` search
     param and, when it's set, open `ProjectSetupWizard` on mount and strip
     the param from the URL so a refresh doesn't re-trigger it.
3. **Get the tour out of the way while the wizard is open.**
   - The tour overlay/card currently sits on top of the page. While the
     project wizard is open, hide the tour card (or reduce it to a small
     "Setup in progress" pill) so the wizard is fully usable, and restore
     it after the wizard closes. `projectCreated` already flips via the
     existing realtime listener, so the tour will advance to
     "Attach an SOP workflow" on its own.
4. **Keep the existing empty-state button working.**
   - The "Create project" button on the empty state stays as-is; the tour
     just uses the same wizard through the query param.
5. **Verify.**
   - Walk through steps 1–5, click "Create my first project →" on step 6,
     confirm the wizard opens immediately, create a project, confirm the
     tour advances to "Attach an SOP workflow" and Indigo can continue.

Out of scope: the earlier billing/webhook work and the Vite error overlay
seen on `/register` in the current preview (that's a separate account mid-
signup, not Indigo's step-6 problem).
