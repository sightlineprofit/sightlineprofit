# Resend templates (Sightline)

Sightline team invites use a **published** Resend template (not manual “automations” in the dashboard — the app sends on invite/resend).

## Prerequisites

1. **Domain verified** in Resend (`sightlineprofit.com`) — without this, no mail delivers.
2. API key with **Templates** permission (send-only keys cannot create/publish templates).

## Option A — Script (recommended)

```bash
RESEND_API_KEY=re_... npm run setup:resend-templates
```

This will:

1. Create or update template **`sightline-team-invite`** from `team-invitation.html`
2. **Publish** the template
3. Print the Worker secret to set: `RESEND_TEAM_INVITE_TEMPLATE_ID=sightline-team-invite`

Then:

```bash
RESEND_TEAM_INVITE_TEMPLATE_ID=sightline-team-invite npm run setup:resend-secrets
# or wrangler secret put RESEND_TEAM_INVITE_TEMPLATE_ID ...
npm run deploy
```

## Option B — Resend dashboard

1. [Templates](https://resend.com/templates) → **Create template**
2. Name: `Sightline team invite`, alias: **`sightline-team-invite`**
3. Paste HTML from `team-invitation.html`
4. Add variables (all type **string**, with fallbacks):

| Key | Fallback (example) |
|-----|---------------------|
| `GREETING` | `Hi there,` |
| `PRINCIPAL_NAME` | `Your principal` |
| `FIRM_NAME` | `Your firm` |
| `ROLE_LABEL` | `team member` |
| `ACCEPT_URL` | `https://sightlineprofit.com` |

5. **Publish** the template
6. Set Worker secret `RESEND_TEAM_INVITE_TEMPLATE_ID` to `sightline-team-invite` (alias) or the template UUID

## Template variables (API send)

The app passes these on each invite:

- `GREETING` — e.g. `Hi Linda,`
- `PRINCIPAL_NAME`, `FIRM_NAME`, `ROLE_LABEL`
- `ACCEPT_URL` — full accept link with token

Subject is set per send: `{Principal} invited you to {Firm} on Sightline`.

## Verify

```bash
TEST_EMAIL_TO=you@example.com npm run test:resend-email
npm run test:resend-team-invite   # uses template if RESEND_TEAM_INVITE_TEMPLATE_ID set
```

Resend → **Emails** should show delivered (not bounced).
