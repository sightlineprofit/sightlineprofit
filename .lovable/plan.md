## Sightline project detail — combined rebuild

Touches one page (`src/routes/_authenticated/sightline.tsx`) and adds a few supporting files. Project list, creation form, and SOP-library template builder are left alone.

### 1. Database — financial audit log

New migration:
- Table `project_financial_audit` (project_id, firm_id, changed_by, changed_at, field_changed text, old_value text, new_value text, reason text).
- GRANT select/insert to authenticated; ALL to service_role.
- RLS: SELECT only when caller is firm principal and row's firm matches `current_firm_id()`. INSERT only when caller is principal of the firm. No UPDATE/DELETE policies (immutable).

### 2. Server functions (`src/lib/sightline.functions.ts`)

- Extend `getProjectDetail` to also return `audit` rows (principal only — empty array otherwise) and `isPrincipal` flag.
- Add `updateProjectFinancial({ project_id, patch: { scoped_rate? }, reason? })` — principal only, writes audit row(s) for each changed field.
- Add `updateProjectPhaseFinancial({ id, patch: { expected_hrs?, billable? }, reason? })` — principal only, writes audit rows tagged `phase_expected_hrs:<name>` / `phase_billable:<name>`.
- Existing `upsertProjectPhase` keeps handling new-phase creation and name edits (non-financial).
- Existing `updateProjectMeta` continues to handle operational edits (name, client, dates).

### 3. Project header (above tabs, always visible)

- Editable inline name (principal), client name, status dropdown.
- Template label: "Template: X" / "Custom phases" / "No phases yet" using the corrected rule.
- Project rate `$X/hr` + date range.
- Health pill computed from per-phase `actual/expected`:
  - Over Budget (terra) if any phase > 100% → "X.XX hrs over on {phase}  –$X actual margin"
  - Heads Up (gold) if any phase 80–99% → "{phase} at X% of budget  $X margin remaining"
  - On Track (green) otherwise → "$X margin remaining  X.XX hrs budget remaining"

### 4. Tabs (`Tabs` from shadcn) — Overview / Phases / Time Log

**Overview**
- Inline prompt if `scoped_rate` null/0 linking to edit panel.
- Profitability summary in three grouped sections (Plan / Reality / Gap) with `Info` HoverCards on every row. Margin variance + Non-billable cost absorbed in Gap. Cormorant Garamond for values (use existing `font-display`), negatives terra, positives success.
- Hours summary stacked bar (full width, 3 segments: billable green, non-bill terra, remaining cream). Overflow segment in darker terra with "+X.XX hrs over budget" label. Labeled values below + total.
- Project details card (client, rate, date range, template, team, notes) with Edit button (operational fields, principal+admin).
- Financial change history (principal only, collapsible, hidden if no audit rows).

**Phases**
- Summary line: "N phases · X.XX hrs scoped · $X potential revenue".
- Collapsible phase cards (Collapsible from shadcn):
  - Collapsed: name, optional category, actual/scoped hrs, status badge (On Track / Heads Up / Over / Non-Bill, sentence case), 4px mini progress bar (segments billable/non-bill/remaining; overflow in darker terra), "Hrs over/under", "Over/Under" $, "In SOP library" badge when `sop_phase_id` set.
  - Expanded: triggered by / done when (from template if available, else empty hint), process steps with estimated hrs muted right-aligned, phase total, time-log entries for this phase, LOG TIME button (links to time calendar pre-filtered).
- Add Phase / Add from SOP Library buttons (Add from SOP Library opens existing template attach flow already present).
- Lock icon on financial inputs when admin (not principal); principal edits open a confirm dialog with optional reason → calls `updateProjectPhaseFinancial`.
- No revenue/margin numbers on this tab.

**Time Log**
- Summary bar: Total / Billable / Non-billable / Revenue earned.
- Filters: Assignee, Phase, Date range, Type.
- Editable rows (date, phase, activity, role, hours, billable, notes). "No phase" terra badge when unassigned. Delete (principal/admin) with inline confirm.
- Empty state copy as spec'd.

### 5. Warnings panel logic

- Show only when at least one condition fires; hidden otherwise.
- Over: per-phase over with hrs + $.
- Approaching: per-phase 80–99%.
- Non-billable dominance: only when `total_hrs ≥ 2 AND billable_hrs = 0`.

### 6. Remove `% consumed` everywhere on this page; replace with plain "X hrs logged · Y hrs budgeted" where context demands a comparison.

### Out of scope (untouched)

- SOP Library template builder, project list, project creation form, dashboard tiles.
- Adding category/role to project_phases (spec mentions "category tag" and "role" on time entries — will render only if data already exists; no schema changes for these).
- Editing project name inline persistence is wired through existing `updateProjectMeta`.

### Files

- New migration `supabase/migrations/<ts>_project_financial_audit.sql`.
- Edit `src/lib/sightline.functions.ts` (add audit + 2 financial mutations, extend detail).
- Edit `src/routes/_authenticated/sightline.tsx` (project detail only).
- Possibly small helper file `src/components/sightline/HoursBar.tsx` to keep the route file readable.

### Risk / notes

- Audit-log RLS uses `is_firm_principal()` which already exists.
- Cost rate uses team average (same as today) — kept consistent across Plan/Reality/Gap.
- This rewrites ~450 lines of the project-detail view; project-list code remains intact.
