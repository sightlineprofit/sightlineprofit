## What's happening

Lemonade Interiors (firm `Lemonade Interiors`, principal Remy Lemon, `caprice.gossett@gmail.com`) is stuck on the onboarding Review step. The toast shows only **"Not found"** with no context, and the DB confirms the finish flow is partially failing:

| Table | Rows for Lemonade |
| --- | --- |
| `firm_config` | 1 ✅ (saveConfig succeeds) |
| `owner_compensation` | 0 ❌ |
| `expenses` | 0 ❌ |
| `firm_members` | 3 (saved live during step 4, not from finish) |
| `firms.onboarding_completed` | `false` |

So the very first save after `saveConfig` is throwing — almost certainly `upsertOwnerCompensation` (server fn `saveOwnerComp`) — and after that the finish() try/catch bails, leaving expenses unwritten and onboarding never marked complete.

## Why we can't yet tell exactly which call failed

`onboarding.tsx` wraps the entire finish sequence in one try/catch (line 170–227) and surfaces whatever `error.message` bubbles up. The server side raises errors from many places (auth middleware, Zod validator, Supabase upsert, RLS violation), and today they all land in the same toast with no label. "Not found" isn't a string thrown anywhere in our own code, so it's either:

- a PostgREST/RLS response whose message was truncated,
- the HTTP status text of a 404 from a stale server-fn hash, or
- a network middleware failure.

Without per-step labelling we can't distinguish these. The published worker logs only show `→ 200` for other users because Lemonade's session wasn't captured in the recent window.

## Fix

Ship a small, safe instrumentation + hardening change to `src/routes/_authenticated/onboarding.tsx` so the next Finish attempt tells us (and the user) exactly which step failed, and doesn't lose progress in between. Then Remy can retry Finish and either succeed or send us a labelled error we can act on immediately.

### Edits

1. **Refactor `finish()` in `src/routes/_authenticated/onboarding.tsx`** so every server-fn call has its own labelled try/catch:
   - `saveConfig` → toast "Couldn't save capacity & targets — <reason>"
   - `saveOwnerComp` → toast "Couldn't save your compensation — <reason>"
   - Each `saveExpense` → collect failures, continue the loop, and at the end toast "Saved X of Y expenses. The following failed: …"
   - `finishOnboarding` stays best-effort as today.
   Return early only if `saveConfig` or `saveOwnerComp` fails; expenses failures should not block completion.

2. **Log the raw error to `console.error` before toasting** so future sessions get captured in the runtime-errors panel with a proper stack.

3. **Skip `saveOwnerComp` when compensation is entirely zero** (defensive — a totally blank comp row currently still hits RLS and Stripe/rate history). Not the root cause here, but avoids a spurious call.

4. No DB / schema / RLS changes. No changes to other routes.

### Verification

- Ask Remy to click **Finish** once more.
- Watch:
  - the labelled toast message (tells us which call),
  - `stack_modern--server-function-logs` for the matching POST + non-200,
  - `supabase--read_query` to see whether `owner_compensation` and `expenses` are now populated.
- Based on the labelled error, apply the real fix (most likely candidates, in order):
  a. `owner_compensation` upsert RLS/onConflict issue → adjust `upsertOwnerCompensation` to `.insert()` when no prior row exists (or drop the read-first pattern).
  b. Stale serverFn bundle hash → have the user hard-reload; if reproducible, rebuild.
  c. Zod validation on an edge-case value → widen the schema.

### Files touched

- `src/routes/_authenticated/onboarding.tsx` (only `finish()` and its immediate helpers)

### Out of scope

- No changes to `/billing`, `/register`, `TrialBanner`, settings, or any server function files in this pass. Those come only after the labelled error identifies the real culprit.
