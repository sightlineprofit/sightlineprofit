# Team Invitation & Member Access — Implementation Plan

This is a large multi-part change touching schema, email infrastructure, onboarding UX, a new public route, and global role enforcement. I'm laying out the plan so you can confirm the approach (and a couple of trade-offs) before I build.

## Part 1 — Onboarding step 02 tooltips & helper text
Mirror the helper text + ⓘ tooltips already on `/setup` Capacity & Rate onto the onboarding step 02 fields (Available hrs/wk, Target billable hrs/wk, Target gross margin). Same Jost 11px / #777 / line-height 1.6 style. Reuse existing `InfoTip` component. File: `src/routes/_authenticated/onboarding.tsx`.

## Part 2 — Onboarding step 04 "Your team" copy
- Add italic note under the section title: *"Financial details are for your planning only and are never shown to the team member."*
- On "Add team member" submit with email present: invitation email fires immediately (Part 3) and a confirmation line renders below the form: *"Invitation sent to [email]…"*
- Existing "you can add team members later" skip note stays prominent.

## Part 3 — Database & invitation email
**Schema migration** on `team_invitations` (adds the missing pieces; some columns already exist):
- `invite_token uuid unique default gen_random_uuid()`
- `invite_token_expiry timestamptz default now() + interval '7 days'`
- `invited_at timestamptz default now()` (exists)
- `accepted_at timestamptz` (exists)
- index on `invite_token`

**Webhook log**: insert row with `event_tag='team-invite'` on send and `event_tag='team-member-onboarded'` on acceptance (`webhook_log` table already exists).

**Email infrastructure**: requires Lovable Cloud email setup. I'll:
1. Check email domain status.
2. If no domain configured → surface the email-setup dialog (you'll need to complete domain setup once before invitations can actually send).
3. Run `setup_email_infra` + `scaffold_transactional_email`.
4. Add a new template `team-invitation.tsx` with the exact subject and body copy you specified, branded with Cormorant Garamond heading + Jost body, gold CTA button.
5. Wire `inviteTeamMember` server fn (already exists in `firm.functions.ts`) to call `sendTransactionalEmail` with `idempotencyKey = team-invite-${invitation.id}-${token}`.

**Trade-off heads-up**: if you haven't set up a verified email domain yet, the templates will scaffold but actual delivery won't work until DNS verifies. The DB record + token + UI all work without that — only the email send blocks.

## Part 4 — `/accept-invite?token=…` route
New **public** top-level route `src/routes/accept-invite.tsx` (NOT under `_authenticated/` — invited users aren't signed in yet).
- Loader uses a public server fn `validateInviteToken({ token })` that uses `supabaseAdmin` to look up the invitation, returns `{ status: 'valid'|'expired'|'invalid', firmName, principalName, email, name, role }`.
- Expired → branded message: *"This invitation link has expired. Ask [firm name] to resend…"*
- Valid → branded form: Name (prefilled), Email (locked), Password, Confirm password, gold "Create my account" CTA.
- Submit calls `acceptInvite({ token, password, name })` server fn:
  - `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`
  - Insert `profiles` row with `firm_id`, `role`, `name`, `accepted_at=now()`, `invited_by`, financial fields copied from invitation
  - Delete invitation row (or null `invite_token` + set `accepted_at`)
  - Insert `webhook_log` row `event_tag='team-member-onboarded'`
- Then client signs in with the new credentials and navigates to `/welcome`.

## Part 5 — `/welcome` (team member)
The route `src/routes/_authenticated/welcome.tsx` already exists and matches your spec's structure. I'll update content to the three cards (Time Calendar, Projects, Knowledge Base), add the gold-tinted note about financial data not being visible, and ensure CTA routes to `/time-calendar`. `welcomed_at` flow already wired.

## Part 6 — Team-role route enforcement
Add a layout-level role check inside `_authenticated/route.tsx` (or a new sibling layout). For `role === 'team'`:
- Allow: `/time-calendar`, `/projects`, `/projects/$id`, `/knowledge-base`, `/settings` (profile-only view), `/welcome`.
- Block everything else (`/dashboard*`, `/setup`, `/growth-roadmap`, `/admin`, `/settings/team`, `/settings/billing`) → `navigate('/time-calendar')` + sonner toast *"That section is managed by your firm principal."*

**Settings page**: today `/settings` is a single page. I'll add a role guard inside it that, for team role, renders only a "Profile" panel (name / email / password) and hides the firm/team/billing sections — no separate `/settings/profile` route needed. If you'd rather I split into sub-routes (`/settings/profile`, `/settings/team`, `/settings/billing`), say the word.

**Financial-data audit**: I'll grep for rate/margin/cost components and confirm the team role can't reach any page that renders them. Project detail page already conditionally renders; I'll add explicit role gating to hide dollar figures, scope-creep $$, profitability, owner comp, and other members' time entries — leaving phase names + status badges + their own entries + Log Time visible.

## Part 7 — Resend invitation in Settings → Team
For each `team_invitations` row with `accepted_at IS NULL`:
- Badge "Invited · pending" (gold muted) + "Invited X days ago"
- "Resend invitation" link → server fn `resendInvitation({ id })` regenerates token, resets expiry to now+7d, re-sends email, toast *"Invitation resent to [email]."*

For accepted members: green "Active · joined [date]" badge, no resend.

## Open questions before I build

1. **Email domain**: have you completed the Lovable email domain setup for this project? If not, I'll trigger the setup dialog first — invitation DB records still work but actual email delivery requires verified DNS.
2. **Settings split**: OK to keep `/settings` as one page with a team-role view that shows only profile fields (simpler), or do you want me to split into `/settings/profile`, `/settings/team`, `/settings/billing` sub-routes (matches your spec literally, more refactor)?
3. **Email-less invitations**: spec says "If email field is filled" → send email. If a principal adds a member without email, we just save the record with no invite. Confirming that's intended (record exists for capacity planning, no email).

Reply "go" with answers to 1–3 (or "go, your call on 2") and I'll implement everything in one pass.
