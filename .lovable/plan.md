## Problem

Your super admin account (`designersupport@proposability.com`) is correctly flagged in the database (`is_super_admin = true`, role = `principal`), and the sidebar already unlocks every nav item for supers. But the **individual page bodies** still gate themselves on `firm.subscription_tier`, and your firm sits on `foundation`. So when you open Sightline, SOP Library, Time Calendar (studio-only paths), Dashboard tiles, BVA, or Knowledge Base, those pages independently render the `TierLocked` upgrade wall instead of the real content.

The shell bypass is the only place super admins are recognized; the route pages don't know about the flag.

## Fix

Centralize the "effective tier" the same way `effectiveRole()` centralizes role:

1. **Add `useEffectiveTier()` (and a helper `effectiveTier(profile, firm)`) in `src/lib/role.tsx`.** Returns `"practice"` whenever `profile.is_super_admin` is true; otherwise returns `firm.subscription_tier ?? "foundation"`. This mirrors how `AppShell` already computes `currentTier`.

2. **Replace every `ctx?.firm?.subscription_tier`-derived tier check on gated pages** with the effective tier:
   - `src/routes/_authenticated/sightline.tsx`
   - `src/routes/_authenticated/sop-library.tsx`
   - `src/routes/_authenticated/time-calendar.tsx`
   - `src/routes/_authenticated/knowledge-base.tsx`
   - `src/routes/_authenticated/dashboard.tsx`
   - `src/routes/_authenticated/dashboard.bva.tsx`
   - `src/routes/_authenticated/settings.tsx` (only the tier-display/lock branches; the billing controls stay as-is)

   `AppShell.tsx` switches to the same helper so there's one source of truth.

3. **Leave billing/admin alone.** `admin.tsx` reads `subscription_tier` to *edit* a firm's plan — that must still reflect the real stored value. `billing.tsx` similarly shows the actual subscription. No changes there.

4. **No DB or migration changes.** Your profile is already correct; this is purely a frontend gating bug.

## Result

Once shipped, signing in as a super admin unlocks every module's page body regardless of the firm's stored tier, matching what the sidebar already implies. Non-super users keep their normal tier gating. Impersonation continues to use the impersonated firm's data, but tier gating stays off for the super (same behavior the shell already uses).