# Catalog cleanup: remove Foundation tier

## Goal

Reduce the catalog to exactly 4 sellable products and eliminate the "foundation" tier from the app entirely:

1. **Studio** — `sightline_studio_monthly_v2`
2. **Practice** — `sightline_practice_monthly_v2`
3. **Early Access — Studio** — renamed from "Early Access — Foundation", price stays **$39/mo locked-for-life**
4. **Early Access — Practice** — `sightline_early_practice_monthly`

New trial/no-subscription users default to `studio` instead of `foundation`.

## Part 1 — Stripe (you do this in More → Payments)

Since this is catalog-only cleanup with no live foundation subscribers, in the Payments dashboard:

1. **Rename** product "Sightline Early Access — Foundation" → **"Sightline Early Access — Studio"**. Keep its existing $39/mo price and its `sightline_early_foundation_monthly` lookup key (the lookup key is a stable ID; renaming the display name is safe and does not require a code change to the key itself — but we will remap it to tier `studio` in code, see Part 2).
2. **Archive** the standalone "Foundation $39/mo" product/price (`sightline_foundation_monthly`). Archiving hides it from checkout without deleting historical records.

After this, the Payments dashboard should show 4 active products.

## Part 2 — Code changes

### `src/lib/stripe.server.ts`
- `Tier` type: drop `"foundation"` → `"studio" | "practice"`.
- `PRICE_TO_TIER`: remove `sightline_foundation_monthly`; remap `sightline_early_foundation_monthly` → `"studio"`.
- `DEFAULT_TIER_PRICE`: remove foundation entry.
- `CHECKOUT_PRICE_KEYS`: remove `sightline_foundation_monthly`. Final 4 keys: `sightline_studio_monthly_v2`, `sightline_practice_monthly_v2`, `sightline_early_foundation_monthly` (Early Access — Studio), `sightline_early_practice_monthly`.

### Database migration
- Change enum `subscription_tier`: add nothing new, but update code paths. Actual Postgres enum change: `ALTER TYPE ... RENAME VALUE 'foundation' TO 'studio'` won't work because studio already exists. Instead: `UPDATE firms SET subscription_tier = 'studio' WHERE subscription_tier = 'foundation'`, then create a new enum without `foundation`, swap column type, drop old enum.
- Update `firms.subscription_tier` default from `'foundation'` to `'studio'`.
- All existing trialing/no-sub firms migrate to `studio`.

### `src/routes/_authenticated/billing.tsx`
- Remove the Foundation plan card (`sightline_foundation_monthly`).
- Rename Early Access — Foundation card display to **"Early Access — Studio"**; update blurb/features to reference Studio features (time calendar, utilization) at the locked $39 rate. Keep price key `sightline_early_foundation_monthly`.
- Final grid: Studio, Practice, Early Access — Studio, Early Access — Practice.

### `src/lib/role.tsx`
- `AppTier`: `"studio" | "practice"`.
- Default tier fallback: `"studio"` instead of `"foundation"`.

### `src/routes/register.tsx`
- Remove Foundation option; default `tier` to `"studio"`.

### `src/routes/post-auth.tsx`
- Default tier `"foundation"` → `"studio"`.

### `src/routes/_authenticated/settings.tsx`
- `tierName` maps: drop foundation; if a legacy row still says "foundation", coerce display to "Studio".
- Default tier fallback → `"studio"`.

### `src/routes/_authenticated/dashboard.tsx`
- Remove foundation-specific branching: `tier === "foundation"` blocks (UpgradeBridge, ManualHoursPanel gating, etc.) either delete or promote to studio behavior. Studio users already get time calendar + utilization; drop the upgrade nudges that assumed foundation.
- Default `tier` prop → `"studio"`.

### `src/routes/_authenticated/time-calendar.tsx`
- `locked = tier === "foundation"` → always unlocked (studio is base). Remove `UpgradeModal` block.

### `src/routes/_authenticated/admin.tsx`
- Remove foundation from tier `<option>` and `tier_visibility` defaults. Only `studio`, `practice`.

### `src/routes/_authenticated/rate-architecture.tsx`
- The "Layer 01 — Foundation" tag is architectural naming, not tier-related. **Leave unchanged.**

### `src/routes/index.tsx`
- Marketing "Foundation" plan card (line 707) — remove or replace with Studio-forward messaging. Confirm the landing pricing section shows Studio + Practice + Early Access options.

### `src/lib/view-as.tsx`, `src/components/shell/ViewSwitcher.tsx`, `src/components/shell/UpgradeModal.tsx`, `src/components/shell/AppShell.tsx`, `src/lib/firm.functions.ts`, `src/lib/admin.functions.ts`, `src/lib/value-moments.functions.ts`
- Drop `"foundation"` from union types, enums, tier lists, `TIER_RANK`, nav item `tier` filters, upgrade modal copy, and pricing tables (`tierMonthly`).
- `AppShell` nav items with `tier: "foundation"` → set to `"studio"` (they'll be visible to all subscribed users since studio is now the base).

### `src/routes/api/public/stripe-webhook.ts`
- Tier type narrows to `"studio" | "practice"`. Any incoming metadata that says `"foundation"` is coerced to `"studio"` before writing (safety net during transition).

## Testing in preview

1. **Verify catalog** — Open `/billing` while signed in. You should see exactly 4 cards: Studio, Practice, Early Access — Studio ($39/mo), Early Access — Practice. No Foundation card.
2. **New signup** — Register a fresh account. In Settings, plan should show "Studio (Trial)" with `trial_ends_at` 14 days out.
3. **Checkout — Early Access — Studio** — Click that card. Embedded checkout opens. Use **`4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP. On success you should be redirected back with a toast; plan card refreshes to "Early Access — Studio".
4. **Checkout — Studio** — Same with the Studio card at its regular price.
5. **Verify entitlement** — After Studio purchase, `/dashboard` and `/time-calendar` should be fully unlocked (no upgrade modal, no foundation gates). Only Practice-only features should still show upgrade prompts.
6. **Test 3-D Secure** — `4000 0025 0000 3155` triggers authentication step.
7. **Test decline** — `4000 0000 0000 0002` — checkout should surface the decline error and no subscription row is created.
8. **Portal** — From `/billing`, click Manage Subscription. Portal opens in new tab. Cancel; on return, plan card should show "cancels on {current_period_end}".

## Technical notes (for reference)

- The lookup key `sightline_early_foundation_monthly` stays put in Stripe and code. Only its human display name (Stripe dashboard) and its tier mapping (code) change. This avoids breaking any historical Stripe references.
- The webhook's `tierFromSubscription` reads `PRICE_TO_TIER[lookup_key]`. After the remap, that key resolves to `studio`, so an early-access subscriber automatically gets studio entitlement without any data migration.
- Enum migration is destructive on the Postgres side; the migration must (1) update all rows, (2) create a new enum type, (3) alter the column to the new type with a `USING` cast, (4) drop the old enum. This runs as one transaction so nothing is left half-migrated.
