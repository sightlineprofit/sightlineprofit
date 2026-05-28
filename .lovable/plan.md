## Problem

The `AppShell` already treats super admins as Practice tier, but the three module pages do their own tier checks against `ctx.firm.subscription_tier` and ignore `is_super_admin`. So a super admin hits `TierLocked` upgrade screens on:

- `/time-calendar` — gated when `tier === "foundation"`
- `/sightline` — gated when `tier !== "practice"`
- `/sop-library` — gated when `tier !== "practice"`

## Fix

In each of the three route files, compute an effective tier that promotes super admins to `practice` when they are NOT impersonating a firm. When a super admin is impersonating, the spec says they should see the firm exactly as its principal would, so the impersonated firm's real tier still applies.

Concretely, in each file replace:

```ts
const tier = (ctx?.firm?.subscription_tier as ...) ?? "foundation";
```

with:

```ts
const isSuperAdmin = !!ctx?.profile?.is_super_admin;
const isImpersonating = !!ctx?.profile?.impersonated_firm_id;
const rawTier = (ctx?.firm?.subscription_tier as "foundation" | "studio" | "practice") ?? "foundation";
const tier = isSuperAdmin && !isImpersonating ? "practice" : rawTier;
```

Files touched:
- `src/routes/_authenticated/time-calendar.tsx`
- `src/routes/_authenticated/sightline.tsx`
- `src/routes/_authenticated/sop-library.tsx`

No DB, RLS, or server-function changes — `getMyContext` already returns `is_super_admin` and `impersonated_firm_id` on the profile.

## Verification

- As super admin (not impersonating): all three modules render their full UI instead of `TierLocked`.
- While impersonating a Foundation firm: Sightline / SOP Library still show the upgrade screen, matching "see exactly what the principal sees".
