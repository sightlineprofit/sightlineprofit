Prompt 03 is the largest of the three: it rewrites `/billing`, the TrialBanner, the onboarding wrapper, the first-time dashboard experience, post-auth routing, and adds two new Settings sections (Default landing page + Billing management). It also needs a small DB migration to store the new preferences.

I'll implement it as one cohesive commit set. Below is what changes, grouped by area.

---

## 1. Database migration

Two additive changes, no destructive edits:

**`firms`**
- `onboarding_completed boolean not null default false`
- `onboarding_completed_at timestamptz`
- `welcome_banner_dismissed boolean not null default false`
- `default_landing_page text default 'dashboard'` (constrained to: `dashboard`, `projects`, `capacity`, `time_calendar`, `rate_architecture`)

**Backfill**
- Any firm that already has `firm_config` rows OR `stripe_subscription_id` gets `onboarding_completed = true` and `welcome_banner_dismissed = true` — existing users don't see the welcome banner or onboarding again.

`firm_preferences` in the prompt is folded into the `firms` table (single row per firm — no need for a separate table). If you'd rather have a separate `firm_preferences` table, say so.

## 2. New / updated server functions (`billing.functions.ts`, `firm.functions.ts`)

- `getBillingSummary` — extend the returned firm shape to include `stripe_price_id`, `billing_frequency`, `stripe_payment_method_id`, plus resolved card info (brand / last4 / exp) from Stripe when a payment method is on file, and `nextChargeAmountCents` from Stripe upcoming-invoice when subscribed.
- `activateSubscription({ frequency })` — new. Uses firm's `stripe_customer_id` + stored payment method to create a Stripe subscription at the correct price (founding vs standard based on original stored `stripe_price_id`), honors remaining trial via `trial_end`, writes back `subscription_status='active'`, `billing_frequency`, `stripe_subscription_id`, `stripe_price_id`.
- `updatePaymentMethod({ paymentMethodId })` — new. Attaches new PM to customer, sets as default. Called from "Use a different card" flow.
- `switchBillingFrequency({ target: 'monthly' | 'annual', mode: 'immediate' | 'at_period_end' })` — new. Monthly → annual: immediate proration to matching price; Annual → monthly: schedule change at `current_period_end` via Stripe subscription schedule.
- `setDefaultLandingPage({ page })` — new. Writes `firms.default_landing_page`.
- `dismissWelcomeBanner()` — new. Sets `firms.welcome_banner_dismissed = true`.
- `completeOnboarding()` — new. Sets `firms.onboarding_completed = true` + `onboarding_completed_at = now()`. Called by onboarding "Finish".

Founding detection uses `FOUNDING_PRICE_KEYS` against `firm.stripe_price_id`.

## 3. `/billing` page — full replacement

Replaces the current 4-plan grid with a single-column ($480 max-width, cream background) activation page:

- Wordmark top with link back to `/dashboard`
- Heading "Activate your subscription" + subline with trial end date
- Plan summary box (gold-bordered, matches `/register`) with billing frequency toggle pre-selected from `firm.billing_frequency`
- Price display that switches on toggle; founding vs standard resolved from firm's `stripe_price_id`
- Sage trial reminder box
- Card section: saved card summary if PM on file, otherwise Stripe Embedded Checkout in setup mode; "Use a different card" toggles the embedded flow
- Full-width activation button whose label and helper text update with frequency
- On success: calls `activateSubscription`, then navigates to `/dashboard`

The old plan grid, Stripe Portal button, and tier switching are removed from this page (Portal access moves to Settings → Billing).

## 4. TrialBanner rewrite

`src/components/TrialBanner.tsx` becomes state-driven:

- Suppresses itself when `firm.onboarding_completed_at` is within the last 5 minutes
- Days 8–14: gold calm variant
- Days 4–7: gold moderate variant
- Days 1–3: terra urgent variant
- Day 0 / expired: full-screen non-dismissible overlay with correct founding/standard price and support email
- All CTAs deep-link to `/billing`

`AppShell` continues to mount it; no change there beyond deleting the tier-upgrade prop path (already inert after Prompt 01).

## 5. Onboarding wrapper

Keep all step content intact. Add:

- Sticky header (wordmark left; "Step N of 5" + trial reminder right)
- 3px gold progress bar
- Step-label strip below (Compensation · Capacity · Expenses · Team · Review) with active/completed/upcoming states
- On Finish: call `completeOnboarding()` before navigating to `/dashboard`

## 6. First-time dashboard state

`src/routes/_authenticated/dashboard.tsx` gets a `WelcomeBanner` block above the rate panel:

- Shown only when `firm.onboarding_completed_at` is within the last 5 minutes AND `welcome_banner_dismissed` is false
- Sage bordered, greets the user by first name, links to `/rate-architecture`
- Dismiss × calls `dismissWelcomeBanner()`
- TrialBanner is suppressed on this session (handled inside TrialBanner via the 5-minute rule)

## 7. `/post-auth` routing

Replace the current `landingPathFor` branch with:

1. No firm yet → existing firm creation → `/onboarding` (or `/register?step=payment` when pending)
2. `firm.onboarding_completed !== true` → `/onboarding`
3. Otherwise → firm's `default_landing_page` mapped to the corresponding route (defaults to `/dashboard`)

## 8. Settings

**Account → Default landing page** (new field)
- Dropdown: Dashboard / Projects / Capacity / Time calendar / Rate architecture
- Auto-saves on change with inline "Saved ✓" (2s auto-dismiss)
- Backed by `firms.default_landing_page`

**Billing section** (new)
- Current plan display: name, frequency, price, next charge date/amount, founding-rate note when applicable
- Switch monthly → annual (immediate, with confirm dialog showing next-charge preview)
- Switch annual → monthly (scheduled at period end, with confirm dialog explaining renewal date)
- During trial: switch links replaced with the "You can switch when your trial ends on [date]" message
- Manage-in-Stripe-portal button retained here for card/invoices/cancellation

## Files changed / added

**New / rewritten**
- `supabase/migrations/2026…_prompt03_prefs.sql`
- `src/routes/_authenticated/billing.tsx` (full rewrite)
- `src/components/TrialBanner.tsx` (full rewrite)
- `src/components/dashboard/WelcomeBanner.tsx` (new)
- `src/components/onboarding/OnboardingHeader.tsx` (new)

**Edited**
- `src/lib/billing.functions.ts` — new server fns + extended summary
- `src/lib/firm.functions.ts` — `completeOnboarding`, `setDefaultLandingPage`, `dismissWelcomeBanner`
- `src/routes/post-auth.tsx` — new routing logic
- `src/routes/_authenticated/onboarding.tsx` — header/progress wrapper + call `completeOnboarding` on finish
- `src/routes/_authenticated/dashboard.tsx` — mount `WelcomeBanner`
- `src/routes/_authenticated/settings.tsx` — add Default landing page and Billing sections
- `src/lib/role.tsx` — `landingPathFor` reads from `firm.default_landing_page`

## Verification

I'll typecheck after the migration types regenerate, then spot-check `/billing`, `/onboarding`, `/dashboard`, `/settings`, and `/post-auth` routing. TrialBanner variants can be visually confirmed by temporarily overriding `trial_ends_at` via the admin firm impersonation flow.

## Open confirmations before I start

1. **Prefs storage** — okay to add columns to `firms` (single-row per firm) rather than a separate `firm_preferences` table? Simpler and matches the current schema.
2. **Card-on-file source of truth** — okay to derive card brand/last4/exp by fetching `paymentMethods.retrieve(firm.stripe_payment_method_id)` server-side each `getBillingSummary` call? (Cached would need a schema addition; live fetch is one Stripe call per billing page load.)
3. **Monthly → annual switch** — proration-on: charge the difference immediately, or apply as credit and charge on next cycle? Prompt says "immediate switch"; I'll default to Stripe's standard proration behavior (charge/credit on next invoice) unless you want an immediate invoice.
4. **Annual → monthly switch** — Stripe subscription schedules can only be set up when a subscription is already in one; if not, I create a schedule on the fly. Any concerns?

Once you confirm those, I'll ship the migration and code together.