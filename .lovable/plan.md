## Problem

Navigating directly to `/onboarding` (or any other non-team-allowed route) as a super admin briefly redirects to `/time-calendar` with the toast "That section is managed by your firm principal."

Root cause is in `AppShell.tsx` (lines ~102–126). On first render, `useMe()` hasn't resolved yet, so:

- `data` is `undefined`
- `realIsSuper` is `false` → `isSuper` is `false`
- `currentRole` falls back to `"team"` (the `?? "team"` default)
- The team-role enforcement `useEffect` runs, sees `/onboarding` isn't in the team allow-list, fires the toast, and navigates away.

By the time `useMe` resolves and reports `is_super_admin = true`, the user has already been booted off the page.

## Fix

In `src/components/shell/AppShell.tsx`, make the team-route enforcement effect wait until the profile is actually loaded before enforcing anything.

Change the guard at the top of the effect (around line 109) from:

```ts
if (isSuper) return;
if (currentRole !== "team") return;
```

to:

```ts
if (!data?.profile) return;      // wait for useMe to resolve
if (isSuper) return;
if (currentRole !== "team") return;
```

That single check prevents the pre-hydration "team default" from ever running the redirect. Real team users still get enforced once their profile loads; super admins (and principals/admins) are never misclassified as team during the loading window.

No other files change. No routes, no calculations, no data model changes.

## Verification

- Sign in as super admin → navigate directly to `/onboarding` → page renders, no toast, no redirect.
- Sign in as a real team user → navigating to `/onboarding` still redirects to `/time-calendar` with the existing toast.
- Sign in as principal/admin → `/onboarding` remains accessible as before.
