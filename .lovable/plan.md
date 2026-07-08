## What changes

Stripe prices are immutable — a price change means creating a new price with a new lookup key and pointing the app at it. Existing subscribers stay on their old price (that's what "grandfathered" means and what makes the Early Access locked-for-life promise work automatically).

### New Stripe products & prices

| # | Product | Price (lookup key) | Amount | Notes |
|---|---|---|---|---|
| 1 | Sightline Studio (existing product, new price) | `sightline_studio_monthly_v2` | $79/mo | New checkout uses this; old `sightline_studio_monthly` retained so current subs keep paying $89 |
| 2 | Sightline Practice (existing product, new price) | `sightline_practice_monthly_v2` | $129/mo | Same pattern — old price retained |
| 3 | Sightline Early Access — Foundation (new product) | `sightline_early_foundation_monthly` | $39/mo | Grants foundation-tier access; locked for life of the subscription |
| 4 | Sightline Early Access — Practice (new product) | `sightline_early_practice_monthly` | $79/mo | Grants practice-tier access; locked for life |

Foundation ($39/mo) stays as-is.

### App wiring

1. **`src/lib/stripe.server.ts`** — extend `PRICE_TO_TIER` so the webhook maps all five active lookup keys to the right tier enum value:
   - `sightline_foundation_monthly` → `foundation`
   - `sightline_early_foundation_monthly` → `foundation`
   - `sightline_studio_monthly` (old) + `sightline_studio_monthly_v2` → `studio`
   - `sightline_practice_monthly` (old) + `sightline_practice_monthly_v2` → `practice`
   - `sightline_early_practice_monthly` → `practice`

   Replace the single `TIER_TO_PRICE` map with `DEFAULT_TIER_PRICE` (Studio v2, Practice v2, Foundation) plus a separate `EARLY_ACCESS_PRICES` list, so checkout knows which price to open for each purchase intent.

2. **`src/lib/billing.functions.ts`** — change `createCheckoutSession`'s input from `tier` to `priceKey` so the caller picks a specific Stripe price (needed because Foundation and Early-Access-Foundation share a tier but have different prices). Look up by lookup key exactly as today.

3. **`src/routes/_authenticated/billing.tsx`** — grow the plan grid from 3 cards to 5:
   - Foundation $39 · Studio $79 · Practice $129 (three standard cards)
   - Early Access — Foundation $39 · Early Access — Practice $79 (two accent cards with an "Early Access · price locked for life" badge in gold)
   Each card's Subscribe button passes the specific `priceKey` to checkout.

4. **No database migration** — the `subscription_tier` enum already has `foundation/studio/practice` and that's enough (Early Access is a pricing variant, not a new tier). The webhook writes whichever tier the lookup key maps to.

5. **No changes to** the trigger `prevent_firm_billing_changes`, the webhook route, the enum, or existing subscribers' price rows in Stripe.

## Assumption I need you to confirm

Your free-text listed Studio $79 and Practice $129 as new prices, but the multiple-choice answer said "only add the two Early Access tiers now, standard prices come later." **I'm going with the free-text**: repricing Studio and Practice now AND adding the two Early Access variants. If you actually want Studio to stay at $89 and Practice at $149, tell me before I implement — I'll drop steps 1–2 in the table above.

## Feature mapping

You skipped the feature-mapping question, so I'm assuming:
- Early Access — Foundation → same features as Foundation
- Early Access — Practice → same features as Practice

Say so now if the Early Access variants should include different modules.

## Not in scope

- Migrating existing subscribers to new prices (they stay grandfathered by design).
- Hiding Early Access tiers behind a promo code or expiring them after a launch window — you can prompt me for that later.
- Annual pricing.
