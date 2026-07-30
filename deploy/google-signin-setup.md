# Google Sign-In setup (Supabase Auth)

**Separate from Google Calendar.** Calendar uses `GOOGLE_CALENDAR_*` on the Cloudflare Worker. Sign-in uses **Supabase Auth → Google** only.

Supabase project: `nizjqvbxrmxkkmnnqzpy`  
Production login: `https://sightlineprofit.com/login`

---

## 1. Google Cloud — Sign-in OAuth client

Open [Credentials](https://console.cloud.google.com/apis/credentials?project=833440392444).

Use the **Web application** client whose ID starts with `833440392444-ke4…` (shown in Supabase → Auth → Google).  
**Do not** use the Calendar client (`…vp0ski…`).

| Field | Value |
|-------|--------|
| **Authorized redirect URIs** | `https://nizjqvbxrmxkkmnnqzpy.supabase.co/auth/v1/callback` |
| **Authorized JavaScript origins** | `https://sightlineprofit.com` |

**Do not** put `https://sightlineprofit.com/post-auth` in Google redirect URIs. That URL belongs in **Supabase** redirect allow list only. Google must redirect to **Supabase**, not your app.

No trailing slash on the Supabase callback URI.

---

## 2. Supabase — Auth → Providers → Google

| Field | Source |
|-------|--------|
| Enable | On |
| Client ID | Same `833440392444-ke4…` client as above |
| Client Secret | **Secret from that same client** (not Calendar) |

After pasting the secret, click **Save**. Re-copy if unsure — trailing spaces break exchange.

**Do not** judge secret validity from `npm run verify:google-signin` length alone — the Supabase Management API returns a **hash** (~64 chars), not your plaintext `GOCSPX-…` value. The script only confirms a secret is **configured**.

```bash
# Add to .env.local (gitignored):
# GOOGLE_AUTH_CLIENT_ID="833440392444-....apps.googleusercontent.com"
# GOOGLE_AUTH_CLIENT_SECRET="GOCSPX-...."

npm run setup:google-signin
```

Verify without exposing secrets:

```bash
npm run verify:google-signin
```

---

## 3. Supabase — Auth → URL Configuration

| Setting | Value |
|---------|--------|
| Site URL | `https://sightlineprofit.com` |
| Redirect URLs | `https://sightlineprofit.com/**` |

---

## 4. Test

1. Incognito window  
2. `https://sightlineprofit.com/login`  
3. Continue with Google  
4. Do **not** refresh on error — close tab and retry  

---

## Error: `Unable to exchange external code: 4/0A…`

This happens **on Supabase’s servers** when Google rejects the token exchange. App/deploy fixes do not bypass it.

Checklist:

1. Client ID + secret in Supabase are a **matched pair** from the **ke4…** OAuth client  
2. Google redirect URI is exactly `https://nizjqvbxrmxkkmnnqzpy.supabase.co/auth/v1/callback`  
3. Regenerate client secret in Google Cloud → paste fresh into Supabase → Save  
4. OAuth consent screen: if **Testing**, add your Google account under Test users  
5. Supabase → Auth → Logs (bottom of settings) for the detailed failure  

---

## App code (already deployed)

- OAuth callback: `/post-auth`  
- PKCE + www→apex: `src/lib/auth-callback-redirect.ts`, `src/lib/auth-session.ts`  
- Worker needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (not Google secrets)
