## Diagnosis

The Historical reference panel is wired correctly on the client and server. `upsertOwnerCompensation` (and the rate/team/expense save handlers in `src/lib/firm.functions.ts`) all call `logChange()` which inserts into `public.firm_change_log`.

However, the DB is set up so **no rows can ever be written or read** by the app:

- `firm_change_log` has **no `GRANT`s** for `authenticated` or `service_role` (only the sandbox exec role).
- It has a SELECT policy (`firm_id = current_firm_id()`) but **no INSERT policy**.
- `logChange()` wraps the insert in a `try/catch` and swallows errors, so saves succeed silently but nothing is ever logged.

Verified: `SELECT ... FROM public.firm_change_log` returns 0 rows despite the user reporting multiple owner-compensation edits.

## Fix

One database migration adding the missing grants and INSERT policy — no application code changes needed.

```sql
GRANT SELECT, INSERT ON public.firm_change_log TO authenticated;
GRANT ALL ON public.firm_change_log TO service_role;

CREATE POLICY "Firm members can write their firm's change log"
  ON public.firm_change_log FOR INSERT
  TO authenticated
  WITH CHECK (firm_id = public.current_firm_id());
```

No UPDATE/DELETE policies — change log is append-only.

## Verification

- Edit owner compensation in Settings → open Historical reference → "Owner compensation" tab shows a new entry with the changed fields.
- Confirm the same works for rate architecture, team cost, team capacity, and operating expenses (all already call `logChange` via existing save handlers).
- Existing historical entries: none will appear retroactively (nothing was ever written); only edits made after the migration will show up.
