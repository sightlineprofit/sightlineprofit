# Resend transactional email (team invites)

Sightline sends team invitations via [Resend](https://resend.com). Production requires a verified **`sightlineprofit.com`** domain and two Worker secrets.

## 1. Resend dashboard

1. Sign in at [resend.com](https://resend.com) (use the team account that should own production email).
2. Register the domain (dashboard **or** CLI):

   ```bash
   RESEND_API_KEY=re_... npm run register:resend-domain
   ```

   This creates **`sightlineprofit.com`** in Resend and prints DNS records for Cloudflare.
3. Add those records in Cloudflare DNS (see below).
4. Wait until status is **Verified** in Resend.
5. **API Keys** → **Create API key** (Sending access) → copy the key (`re_…`).

### DNS on Cloudflare (typical)

- Open **Cloudflare** → **sightlineprofit.com** → **DNS**.
- Add each record exactly as Resend lists (name/host, type, value).
- For DKIM/CNAME records: **Proxy status = DNS only** (grey cloud).
- Resend’s dashboard shows when verification succeeds.

## 2. Choose “From” address

Use an address on the verified domain, for example:

```text
Sightline <hello@sightlineprofit.com>
```

You do not need a real mailbox at that address for sending; Resend sends on your behalf once the domain is verified.

## 3. Cloudflare Worker secrets

From repo root (Wrangler must be logged in: `npx wrangler whoami`):

```bash
npm run setup:resend-secrets
```

Or non-interactive:

```bash
RESEND_API_KEY=re_xxxx \
TRANSACTIONAL_EMAIL_FROM='Sightline <hello@sightlineprofit.com>' \
npm run setup:resend-secrets
```

This runs a production build if needed, then sets `RESEND_API_KEY` and `TRANSACTIONAL_EMAIL_FROM` on worker **`sightlineprofit-sightlineprofit`**.

## 4. Verify before full deploy

Send a test message (uses Resend directly, not the Worker):

```bash
RESEND_API_KEY=re_xxxx \
TRANSACTIONAL_EMAIL_FROM='Sightline <hello@sightlineprofit.com>' \
TEST_EMAIL_TO=you@example.com \
npm run test:resend-email
```

## 5. Deploy

Secrets are live on the Worker immediately after `setup:resend-secrets`, but you should deploy the current app build:

```bash
npm run deploy
```

Or: `npm run release:prod` (migrations + schema check + deploy).

## 6. Product test

1. Open **https://sightlineprofit.com** → **Settings** → **Team**.
2. Invite an inbox you control.
3. Confirm email arrives; link opens **/accept-invite?token=…**.

Check **Resend → Emails** for delivery logs. Check **Cloudflare Worker logs** if the invite saves but no email (look for `[inviteTeamMember] email send failed`).

## Secrets reference

| Secret | Example |
|--------|---------|
| `RESEND_API_KEY` | `re_…` |
| `TRANSACTIONAL_EMAIL_FROM` | `Sightline <hello@sightlineprofit.com>` |

`PUBLIC_APP_URL` is set to `https://sightlineprofit.com` via `.env.production` at deploy time.

## Local development

Without `RESEND_API_KEY`, dev skips sends (console warning). Invites still persist in the database. Use production or `npm run test:resend-email` to validate Resend.
