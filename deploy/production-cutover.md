# Production cutover — sightlineprofit.com

Checklist for moving the live site from Lovable hosting to **Cloudflare Workers**, with DNS at **Namecheap**.

**Production URL:** `https://sightlineprofit.com`  
**Supabase project:** `nizjqvbxrmxkkmnnqzpy`  
**Deploy target:** Cloudflare Workers (Nitro `cloudflare-module` preset)

---

## Pre-flight (do before DNS switch)

### 1. Database

- [ ] Apply **all** files in `supabase/migrations/` via [Supabase SQL Editor](https://supabase.com/dashboard/project/nizjqvbxrmxkkmnnqzpy/sql/new) (SQL only — not TypeScript from `src/`).
- [ ] Confirm production data is in `nizjqvbxrmxkkmnnqzpy` (not the old Lovable project `ncekwpeojcutmunadrbj`).
- [ ] Smoke-test locally: login, dashboard, SOP attach, assign someone.

### 2. Supabase Auth URLs

In [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/nizjqvbxrmxkkmnnqzpy/auth/url-configuration):

| Setting | Value |
|--------|--------|
| **Site URL** | `https://sightlineprofit.com` |
| **Redirect URLs** | `https://sightlineprofit.com/**` |
| | `http://localhost:8080/**` (dev) |

### 3. Google OAuth (if using “Sign in with Google”)

1. [Supabase → Auth → Providers → Google](https://supabase.com/dashboard/project/nizjqvbxrmxkkmnnqzpy/auth/providers) — enable with your Google Cloud OAuth client ID/secret.
2. In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your OAuth client:
   - **Authorized JavaScript origins:** `https://sightlineprofit.com`
   - **Authorized redirect URIs:** `https://nizjqvbxrmxkkmnnqzpy.supabase.co/auth/v1/callback`

### 4. Stripe (live)

In [Stripe Dashboard](https://dashboard.stripe.com/) (live mode):

- [ ] Products/prices use the `lookup_key`s in `src/lib/stripe.server.ts` (`sightline_standard_monthly`, etc.).
- [ ] **Webhook endpoint:** `https://sightlineprofit.com/api/public/payments/webhook?env=live`
- [ ] Copy **live** webhook signing secret → `PAYMENTS_LIVE_WEBHOOK_SECRET`
- [ ] Copy **live** secret key → `STRIPE_LIVE_API_KEY`
- [ ] Live publishable key is already in `.env.production` as `VITE_PAYMENTS_CLIENT_TOKEN`

---

## Cloudflare setup

### 5. Create Cloudflare account and add domain

1. Sign up at [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Add a site** → enter `sightlineprofit.com` → choose **Free** plan.
3. Cloudflare shows two nameservers (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`).

### 6. Point Namecheap DNS to Cloudflare

1. Log in to [Namecheap](https://www.namecheap.com/) → **Domain List** → **Manage** for `sightlineprofit.com`.
2. **Nameservers** → **Custom DNS**.
3. Replace Lovable/current nameservers with Cloudflare’s two nameservers.
4. Save. Propagation usually takes 15 minutes–48 hours (often under 1 hour).
5. In Cloudflare, wait until the domain shows **Active**.

> **Why move DNS to Cloudflare?** Workers custom domains (especially the apex `sightlineprofit.com`) work reliably when Cloudflare manages the zone. Keeping DNS only at Namecheap while using Workers is possible for `www` via CNAME, but the apex domain is awkward without Cloudflare.

### 7. Install Wrangler and log in

```bash
npm install -g wrangler
wrangler login
```

### 8. Build and deploy the worker

From the repo root:

```bash
npm run build
npm run deploy
```

First deploy creates worker `sightlineprofit-sightlineprofit` (name from Nitro). Note the `*.workers.dev` URL and confirm it loads.

### 9. Set production secrets on Cloudflare

Server functions read these at runtime:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config .output/server/wrangler.json
wrangler secret put STRIPE_LIVE_API_KEY --config .output/server/wrangler.json
wrangler secret put PAYMENTS_LIVE_WEBHOOK_SECRET --config .output/server/wrangler.json
```

Optional (email queue still uses Lovable send API until migrated):

```bash
wrangler secret put LOVABLE_API_KEY --config .output/server/wrangler.json
```

Set plain variables in Cloudflare dashboard → Workers → your worker → Settings → Variables:

- `PUBLIC_APP_URL` = `https://sightlineprofit.com`
- `SUPABASE_URL` = `https://nizjqvbxrmxkkmnnqzpy.supabase.co`

`VITE_*` values are baked in at **build** time from `.env.production` — rebuild after changing them.

### 10. Attach custom domain

1. Cloudflare dashboard → **Workers & Pages** → your worker → **Settings** → **Domains & Routes**.
2. **Add** → **Custom domain**:
   - `sightlineprofit.com`
   - `www.sightlineprofit.com` (recommended)
3. Cloudflare creates the DNS records automatically.

---

## Cutover day

### 11. Pre-cutover smoke test (on `*.workers.dev`)

- [ ] Login / signup (email + Google)
- [ ] Dashboard loads with real data
- [ ] Register / checkout flow
- [ ] Stripe webhook test event

### 12. Switch traffic

Once Cloudflare nameservers are active and custom domain is attached, visit `https://sightlineprofit.com`.

### 13. Post-cutover verification

- [ ] Home, login, app routes on production domain
- [ ] Google OAuth on production
- [ ] Stripe checkout + webhook updates firm record
- [ ] SOP attach + assign someone

### 14. Decommission Lovable

After 24–48 hours stable:

- [ ] Stop/pause Lovable published deployment
- [ ] Revoke unused `LOVABLE_API_KEY` once email is migrated

---

## Ongoing deploy workflow

```bash
npm run dev       # local — http://localhost:8080
npm run build     # production build (.env.production for VITE_*)
npm run deploy    # wrangler deploy
```

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Server functions fail | Set `SUPABASE_SERVICE_ROLE_KEY` in Cloudflare secrets |
| “Could not find column … schema cache” | Run pending SQL migrations in Supabase |
| Google login redirects wrong | Fix Supabase Site URL + Google OAuth redirect URI |
| Stripe checkout fails | Verify `STRIPE_LIVE_API_KEY` + live publishable key in `.env.production` |
| Webhooks not updating | Webhook URL must be `https://sightlineprofit.com/api/public/payments/webhook?env=live` |
| Apex domain not resolving | Nameservers must point to Cloudflare; attach custom domain to worker |
