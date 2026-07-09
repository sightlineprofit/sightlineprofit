## Root cause

The initial migration `20260708233522_...sql` defines `seed_firm_activity_types(firm_id)` and runs it once inside a `DO` block against every firm that existed at migration time. Nothing runs it for firms created afterwards:

- No `AFTER INSERT` trigger on `public.firms`.
- No call inside `handle_new_user()` or any signup / firm-creation server function.

Lofty Designs, LLC was created on 2026-07-09 (migration ran 2026-07-08), so its `activity_types` row count is 0 and the quick-log picker shows nothing. A DB check confirms Lofty is currently the only affected firm, but the same gap will hit every future firm.

## Fix (one migration)

1. Backfill any firm missing seeded activities:
   ```sql
   DO $$
   DECLARE r record;
   BEGIN
     FOR r IN SELECT id FROM public.firms f
              WHERE NOT EXISTS (SELECT 1 FROM public.activity_types a WHERE a.firm_id = f.id)
     LOOP PERFORM public.seed_firm_activity_types(r.id); END LOOP;
   END $$;
   ```
2. Add an `AFTER INSERT` trigger on `public.firms` that calls `seed_firm_activity_types(NEW.id)` so every future firm gets the six defaults automatically (Internal Admin, Business Development, Client Meeting Prep, Onsite Visit, Team Meeting, Uncategorized).

No app code changes needed — the picker in `time-calendar.tsx` and `getCalendarData` in `time.functions.ts` already read from `activity_types` scoped by `firm_id`; they just had nothing to return for Lofty.

## Verification

- Re-query `activity_types` for Lofty's firm id → 6 rows.
- Open Time Calendar as a Lofty user → activity picker lists the six defaults with color dots and billable flags.
- Create a throwaway new firm → confirm the trigger seeds it immediately.
