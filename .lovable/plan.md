## What's actually built vs. what's missing

The database migration ran — `activity_types` has 30 seeded rows across firms (Internal Admin, Business Development, Client Meeting Prep, Onsite Visit, Team Meeting, Uncategorized), and `time_entries` has `activity_type_id` + `description` columns. **But none of the app code was wired to any of it.** The quick-log form and calendar still use the older per-firm `activity_groups` picker and have no description input.

## Fix — Phase A only (the two items you asked about)

Scope: wire the seeded defaults into the picker and add the description field. Settings CRUD, Uncategorized-reassignment banner, and annual-breakdown visualizations from the earlier spec are **not** part of this plan — flag as follow-ups.

### 1. `src/lib/time.functions.ts`
- `getTimeCalendarData`: also fetch `activity_types` for the firm (ordered by `sort_order`, name), return as `activityTypes`.
- `saveTimeEntry` schema: accept `activity_type_id: z.string().uuid().nullable().optional()` and `description: z.string().max(500).nullable().optional()`; pass both to the insert/update (the DB columns already exist).

### 2. `src/routes/_authenticated/time-calendar.tsx`
- Type: add `activity_type_id: string | null` and `description: string | null` to the local `Entry` type; add an `ActivityType` type list alongside `Ag`.
- `EntryForm`:
  - Replace the "Activity" `<Select>` options source from `ags` → `activityTypes`, using `activity_type_id` state (`atId`).
  - Auto-set `billable` to the picked activity's `is_billable` when the user changes activity (don't override manual toggles after that).
  - Add a **Description** single-line input above/below Notes (`maxLength=500`, placeholder like "What did you work on?"), shown in both compact quick-log and full dialog modes.
  - Send `activity_type_id` + `description` in the `saveFn` call; drop `activity_group_id`.
- Calendar tooltips / list rows (`agName(e.activity_group_id)` at ~423 and ~1011): resolve the label from `activityTypes` by `activity_type_id`, fall back to legacy `activity_group_id` for the two existing rows so nothing disappears.

### 3. Legacy `activity_groups` picker
Leave the table + 5 rows in place (2 legacy entries reference them). Only the picker source changes. No migration needed.

### Verification
- Quick-log form shows the six seeded activities by default with a colored dot.
- Selecting "Business Development" flips billable off automatically; "Client Meeting Prep" flips it on.
- Description text saves and re-renders on the entry after page reload; visible in the full edit dialog.
- Existing legacy entries with `activity_group_id` still show their old label in the calendar list.

## Not in this plan (still outstanding from the earlier spec)
- Settings → Activity types CRUD (reorder, edit, delete-with-reassign, Uncategorized banner).
- Firm-as-project auto-assignment for non-billable entries.
- Annual-picture per-member + firm-wide activity breakdown bars.
Call these out separately once Phase A is verified.
