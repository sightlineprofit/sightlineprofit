# Pinterest vision board — setup & security

The Future → Vision tab can pull inspiration from Pinterest **or** from **uploaded images** (`firm_vision.uploaded_image_urls`). For demos and early production, **upload images** works with zero third-party approval.

---

## Production reality: OAuth app approval

Pinterest OAuth is **not** instant in production.

1. Register at [developers.pinterest.com](https://developers.pinterest.com/).
2. Create an app and request scopes:
   - `boards:read`
   - `pins:read`
3. Submit the app for **review/approval** (standard read scopes; approval often takes **several business days**).
4. Plan demos accordingly: use **Upload images** until approval is granted.

**Redirect URI (production):**  
`https://sightlineprofit.com/auth/pinterest/callback`

**Redirect URI (local dev):**  
`http://localhost:8080/auth/pinterest/callback`

---

## Environment variables

Set on the Worker / server (never `VITE_*`):

| Variable | Purpose |
|----------|---------|
| `PINTEREST_CLIENT_ID` | OAuth client id |
| `PINTEREST_CLIENT_SECRET` | OAuth secret |
| `PINTEREST_REDIRECT_URI` | Optional override; defaults to `PUBLIC_APP_URL` + `/auth/pinterest/callback` |
| `PUBLIC_APP_URL` | App origin for redirects |

---

## Token security (required)

Pinterest tokens **must never reach the browser**.

| Layer | Behavior |
|-------|----------|
| **Storage** | `firm_vision.pinterest_access_token`, `pinterest_refresh_token` |
| **Writes** | OAuth callback + refresh in `src/lib/pinterest.server.ts` via **`supabaseAdmin` (service role)** only |
| **Reads for API** | `fetchPinterestBoards` / `fetchPinterestPins` — server only |
| **Client API** | `getFuturePageData` returns `FirmVisionClient` with `pinterest_connected: boolean` only — **no token fields** |
| **Pinterest server fns** | Boards/pins/connect URL — TanStack server functions; handlers use service role |
| **RLS** | `firm_vision` SELECT/WRITE limited to firm admins (`is_firm_admin`) |
| **Column privileges** | Migration `20260729140000_firm_vision_pinterest_token_privileges.sql` **REVOKEs** SELECT/INSERT/UPDATE on token columns from `authenticated` |

If any change adds `pinterest_access_token` or `pinterest_refresh_token` to a client-facing select, server fn response, or `select('*')` on `firm_vision` for the user JWT — **fix before deploy**.

### Verify after migration

In Supabase SQL (as check only):

```sql
-- Should fail for authenticated role (run via client with user JWT in app, or policy test):
-- select pinterest_access_token from firm_vision limit 1;
```

Apply migrations:

```bash
bash scripts/apply-all-pending-migrations-local.sh
```

---

## Upload images fallback (no Pinterest)

Designers can populate the mosaic from **`uploaded_image_urls`** on `firm_vision` (same grid as pins). No OAuth required. Storage wiring can use the existing `firm-resources` bucket pattern when product-ready; URLs can be set via server fn until upload UI ships.

---

## Related code

- OAuth callback: `src/routes/auth/pinterest/callback.tsx`
- Pinterest API: `src/lib/pinterest.server.ts`
- Vision data (safe DTO): `src/lib/goals.functions.ts` → `FirmVisionClient`, `getFuturePageData`, `saveFirmVision` (zod schema excludes tokens)
