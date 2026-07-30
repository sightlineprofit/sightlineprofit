# Google Calendar overlay — setup

Read-only calendar overlay for Time Calendar. Uses a **separate** Google OAuth client from Supabase “Sign in with Google” (different redirect URI and scope).

**Production callback:** `https://sightlineprofit.com/api/calendar/google/callback`  
**Dev callback:** `http://localhost:8080/api/calendar/google/callback`

---

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select (or create) a project — e.g. **Sightline**.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if Workspace-only).
   - App name: **Sightline**
   - Support email: your email
   - Scopes: add **`.../auth/calendar.readonly`** (Google Calendar API → Read-only access).
   - Test users: add your Google account while app is in **Testing** mode.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: **Sightline Calendar Overlay**
   - **Authorized JavaScript origins** (optional for server-side OAuth):
     - `https://sightlineprofit.com`
     - `http://localhost:8080`
   - **Authorized redirect URIs** (required):
     - `https://sightlineprofit.com/api/calendar/google/callback`
     - `http://localhost:8080/api/calendar/google/callback`
5. Copy **Client ID** and **Client secret**.

> **Note:** Supabase Auth Google sign-in uses redirect  
> `https://nizjqvbxrmxkkmnnqzpy.supabase.co/auth/v1/callback`.  
> Do **not** reuse that client unless you add the Sightline callback URIs above to the same client.

---

## 2. Apply database migration

Run once against project `nizjqvbxrmxkkmnnqzpy`:

```bash
# Option A — personal access token (easiest)
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply-calendar-migration

# Option B — Transaction pooler URL from Supabase → Database → Connect
DATABASE_URL='postgresql://postgres.nizjqvbxrmxkkmnnqzpy:...@aws-0-....pooler.supabase.com:6543/postgres' \
  npm run db:apply-calendar-migration
```

Or paste `supabase/migrations/20260720150000_calendar_connections.sql` into  
[Supabase SQL Editor](https://supabase.com/dashboard/project/nizjqvbxrmxkkmnnqzpy/sql/new).

Verify:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('calendar_connections', 'calendar_events', 'calendar_oauth_states');
```

---

## 3. Cloudflare Worker secrets

After creating the OAuth client:

```bash
GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=... npm run setup:google-calendar-secrets
```

Or interactively:

```bash
npm run setup:google-calendar-secrets
```

Existing secrets (`SUPABASE_SERVICE_ROLE_KEY`, Stripe, etc.) are unchanged.

`PUBLIC_APP_URL` is set at **runtime** on the Worker via `scripts/patch-wrangler-production.mjs` (from `.env.production`). Redeploy after changing it.

---

## 4. Deploy

```bash
npm run deploy
```

Latest deploy includes the calendar callback route and Time Calendar UI.

---

## 5. Smoke test

1. Go to [Time Calendar](https://sightlineprofit.com/time-calendar).
2. **Connect Google** → authorize calendar read access.
3. Return to Time Calendar; dashed blue blocks should show Google events.
4. Click an event → **Log time** prefills title/times; saving links the event (overlay hides it).

---

## Local dev

Add to `.env.local` (git-ignored):

```env
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
PUBLIC_APP_URL=http://localhost:8080
```

Use the same OAuth client with the localhost redirect URI.

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| No connect banner | Set `GOOGLE_CALENDAR_CLIENT_*` on Worker (prod) or `.env.local` (dev). Rebuild/redeploy prod. |
| `redirect_uri_mismatch` | Add exact callback URL to Google OAuth client redirect URIs. |
| `access_denied` / consent | Add user as test user on OAuth consent screen (Testing mode). |
| Connect works, no events | Confirm Calendar API enabled; check Worker logs (`wrangler tail`). |
| Server error after connect | Run calendar migration SQL; confirm tables exist. |
