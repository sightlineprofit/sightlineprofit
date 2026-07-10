## Add Stripe Go-Live Checklist to `/admin`

Add a super-admin-only card on `/admin` (Firms tab or a new "Payments" section) that shows the 5-step Stripe go-live status and remaining actions, so you can see live-payments readiness without leaving the app.

### Scope
- **Read-only**: no code changes to Stripe wiring, prices, or checkout flow.
- Super-admin gated (same `assertSuper` pattern already used on `/admin`).

### Steps

1. **Server function** — `src/lib/admin.functions.ts`
   - Add `getStripeGoLiveStatus` (super-admin only, `requireSupabaseAuth` + `assertSuper`).
   - Calls the platform go-live status endpoint and returns `{ steps: [{id,title,status,disabled}], all_completed, sandbox_account_id }`.

2. **UI component** — `src/components/admin/GoLiveChecklist.tsx`
   - Renders each of the 5 steps with a status pill (Completed / In progress / Not started / Locked).
   - Shows current step (Step 2: "Complete the go-live form on Stripe") as the active call-to-action.
   - Includes a "Go to Stripe dashboard" link for the actionable step and a "Refresh status" button.
   - Displays sandbox account ID at the bottom (small, muted) for support reference.

3. **Wire into `/admin`** — `src/routes/_authenticated/admin.tsx`
   - Add a "Live payments" section above the Firms table (super-admin only).
   - Uses `useQuery` with a 30s stale time; refetch button invalidates.

### Current live status (for reference in the UI)
- ✅ Sandbox claimed
- 🟡 Complete Stripe go-live form ← next action
- 🔒 Install Lovable app on live account
- 🔒 Provision live keys (automatic)
- 🔒 Readiness check

### Files
- `src/lib/admin.functions.ts` (add one server fn)
- `src/components/admin/GoLiveChecklist.tsx` (new)
- `src/routes/_authenticated/admin.tsx` (mount component)

No DB migrations, no changes to checkout, webhook, or price code.