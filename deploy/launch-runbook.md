# Sightline public launch runbook

Execute steps **in order**. Do not deploy app code without applying DB migrations first.

**Production:** `https://sightlineprofit.com` · **Supabase:** `nizjqvbxrmxkkmnnqzpy`

---

## 1. Resend dashboard

Full walkthrough: **[`deploy/resend-setup.md`](./resend-setup.md)** · **Templates:** [`deploy/resend/templates/README.md`](./resend/templates/README.md)

1. Verify **`sightlineprofit.com`** in Resend (DNS in Cloudflare) — **required for delivery**.
2. Create the **team invite template** (`sightline-team-invite`) — dashboard or `npm run setup:resend-templates` (needs a **full-access** API key; send-only keys must use the dashboard).
3. Create a Resend API key with **Sending** (send-only is OK for production sends).
4. Run **`npm run setup:resend-secrets`** (sets `RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_FROM`, `RESEND_TEAM_INVITE_TEMPLATE_ID`).
5. Optional: **`npm run test:resend-team-invite`** with `TEST_EMAIL_TO=…`.
6. **`npm run deploy`** (or `release:prod`).
7. **Test:** Settings → Team → invite → `/accept-invite?token=…`.

Optional: schedule the email queue worker (if you use pgmq) to POST `/lovable/email/queue/process` with Bearer `SUPABASE_SERVICE_ROLE_KEY` — the queue now uses the same Resend sender when `html`/`text` are in the payload.

---

## 2. Stripe (live billing)

1. Complete Stripe account activation (business + bank).
2. Create live products/prices with lookup keys referenced in `src/lib/stripe.server.ts`.
3. Worker secrets:

   ```bash
   npx wrangler secret put STRIPE_LIVE_API_KEY --config .output/server/wrangler.json
   npx wrangler secret put PAYMENTS_LIVE_WEBHOOK_SECRET --config .output/server/wrangler.json
   ```

4. Webhook endpoint (live):  
   `https://sightlineprofit.com/api/public/payments/webhook?env=live`
5. **Test:** register → checkout → firm gets `subscription_status=active` → onboarding.

See also `deploy/production-cutover.md` §4 and §11.

---

## 3. Database + app release (every time)

From repo root (requires `.env.local` with pooler creds for migrate):

```bash
npm run release:prod
```

This runs:

1. `npm run db:apply-all-pending`
2. `npm run db:verify-release-schema`
3. `npm run deploy`

If you skip migrate, users may see PostgREST errors like *Could not find the '…' column in the schema cache*.

---

## 4. Production smoke test (manual)

After `release:prod`:

- [ ] Login / signup (email + Google)
- [ ] Dashboard loads with firm data
- [ ] Sightline: project, attach workflow **period**, log time with **assignee** + **task/step**
- [ ] Team invite email received and accept-invite completes
- [ ] Stripe checkout (test card in sandbox, real flow in live when ready)
- [ ] Time calendar + optional Google Calendar (see `deploy/google-calendar-setup.md`)

---

## 5. Supabase Auth URLs

[URL configuration](https://supabase.com/dashboard/project/nizjqvbxrmxkkmnnqzpy/auth/url-configuration):

| Setting | Value |
|--------|--------|
| Site URL | `https://sightlineprofit.com` |
| Redirect URLs | `https://sightlineprofit.com/**`, `http://localhost:8080/**` |

---

## 6. Worker secrets checklist

| Secret | Required for |
|--------|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | All server functions |
| `RESEND_API_KEY` | Team invites (prod) |
| `TRANSACTIONAL_EMAIL_FROM` | From address (prod) |
| `STRIPE_LIVE_API_KEY` | Live checkout |
| `PAYMENTS_LIVE_WEBHOOK_SECRET` | Subscription sync |
| `GOOGLE_CALENDAR_*` | Calendar overlay (optional) |

Vars (non-secret): `PUBLIC_APP_URL`, `SUPABASE_URL` — patched/baked at deploy.

---

## 7. Ongoing operations

- **Deploy:** `npm run release:prod` (not `deploy` alone).
- **CI:** GitHub Actions runs `npm run build` on push/PR (`.github/workflows/build.yml`).
- **Errors:** Watch Cloudflare Worker logs; add Sentry or similar when ready.

---

## 8. Decommission Lovable hosting

After 24–48h stable on Cloudflare:

- Pause Lovable published app
- Remove unused `LOVABLE_API_KEY` once queue/email no longer depend on Lovable send API
