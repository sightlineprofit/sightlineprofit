# Supabase Auth: leaked password protection

The Database Linter **“Leaked Password Protection Disabled”** warning is an **Auth** setting, not SQL.

## Option A — Dashboard (recommended)

1. Open [Authentication → Providers → Email](https://supabase.com/dashboard/project/nizjqvbxrmxkkmnnqzpy/auth/providers)
2. Enable **Prevent use of leaked passwords** (HaveIBeenPwned)

Some orgs need a paid plan for this toggle.

## Option B — Management API

```bash
cd "/Users/capricegossett/Lovable Migration Sightline"
SUPABASE_ACCESS_TOKEN='sbp_…' npm run setup:auth-leaked-passwords
```

Create a token at [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).

If the API returns an error about `password_hibp_enabled`, use **Option A** — field names vary by Supabase version.

After enabling, new sign-ups and password changes that match known breaches are rejected.
