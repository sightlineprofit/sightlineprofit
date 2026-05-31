## What's happening

The fallback "This page didn't load" screen you're hitting is the root error boundary in `src/routes/__root.tsx`. The underlying runtime error captured by the preview is:

> `Failed to fetch dynamically imported module: …/virtual:tanstack-start-client-entry`

This is a known Vite / TanStack Start behavior, not a bug in the Sightline page itself:

- Vite code-splits each route into its own chunk with a hashed filename.
- When the dev server rebuilds (you saved a file, the preview rebuilt, or HMR reconnected), the chunk hash changes.
- The browser is still holding the old hash. The first time it tries to load a new chunk (e.g. opening a project triggers a hover/dialog/code path whose module hadn't been fetched yet), the request 404s and React throws.
- Hitting Back navigates within already-loaded code, then re-entering re-runs the import — by then Vite has served the new chunk, so it works. That's why "going back fixes it."

It will also occasionally happen in production right after a redeploy, for the same reason (old client + new chunk hashes).

## Fix

Make the app auto-recover from stale-chunk errors instead of showing the fallback.

1. **In `src/routes/__root.tsx` `ErrorComponent`:**
   - Detect the dynamic-import / chunk-load error message family:
     - `Failed to fetch dynamically imported module`
     - `Importing a module script failed`
     - `error loading dynamically imported module`
   - When matched, do a one-shot `window.location.reload()` (guarded by a `sessionStorage` flag like `__chunk_reload_at` with a 10 s window) so we never loop if the reload also fails. On a successful reload the flag is cleared.
   - On non-matching errors, keep the current fallback UI.

2. **Add a global `vite:preloadError` listener** (Vite fires this event when a preload fails) in the same root component's `RootComponent` `useEffect`:
   - Call `event.preventDefault()` and the same guarded `window.location.reload()`.
   - This catches the case where the failure happens during preload (link hover) before React renders anything.

3. **No changes to Sightline / ProjectDetail.** The page itself is fine — the symptom only looked Sightline-specific because that's where the first uncached chunk happened to load.

## Files touched

- `src/routes/__root.tsx` — extend `ErrorComponent` with stale-chunk detection + guarded reload; add a `vite:preloadError` listener in `RootComponent`.

## Why not just "tell users to refresh"

The error is recoverable and deterministic — the second attempt always works. Forcing a single silent reload turns a confusing fallback page into an invisible 200 ms blip, and the same fix protects every route after a deploy, not just Sightline.
