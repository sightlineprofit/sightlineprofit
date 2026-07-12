# Releasing / updating the live site

The site is published via **Lovable**, which is connected to this GitHub repo. Lovable
auto-syncs and redeploys when `main` changes, so **pushing to `main` ships the app**.
You can develop entirely in Cursor. See `AGENTS.md` for project/Supabase details.

> Important: pushing to `main` deploys **code only**. Database migrations under
> `supabase/migrations/` are **not** applied automatically — run the migration step below.

## Checklist for each change

1. Sync and branch:
   ```
   git checkout main && git pull origin main
   git checkout -b feature/<name>
   ```
2. Make changes in Cursor and test locally:
   ```
   npm run dev          # http://localhost:8080  (needs SUPABASE_SERVICE_ROLE_KEY set)
   npm run build:dev    # optional: catch build errors before shipping
   ```
   (`npm run lint` currently reports many pre-existing errors — not a release blocker.)
3. **If you added/changed `supabase/migrations/*.sql`**, apply them to the live DB first
   (see "Applying migrations" below). Do this *before* merging so code and schema stay aligned.
4. Add any new **secrets/env vars** (e.g. Stripe live keys, `LOVABLE_API_KEY`) in Lovable /
   your hosting env. Never commit secrets. Client config uses `VITE_*`; server-only keys like
   `SUPABASE_SERVICE_ROLE_KEY` live in the host env.
5. Commit, push, and merge to `main` (via PR):
   ```
   git add -A && git commit -m "…" && git push -u origin feature/<name>
   ```
6. Lovable picks up `main` and redeploys. If your project isn't set to auto-publish, click
   **Publish** in Lovable to cut the release.
7. First launch only: in Supabase → Authentication → URL Configuration, set the **Site URL**
   and **Redirect URLs** to your production domain (the app redirects to `/post-auth`).

## Applying migrations to the live database

`main` deploys code, not schema. After adding migrations, run:

```
SUPABASE_DB_URL="<session pooler connection string>" npm run db:migrate
# preview only:
SUPABASE_DB_URL="<...>" npm run db:migrate -- --dry-run
```

- Use the **Session/Transaction pooler** connection string from Supabase → Project
  `nizjqvbxrmxkkmnnqzpy` → Connect → "Session pooler" (host `aws-0-<region>.pooler.supabase.com`,
  user `postgres.<ref>`). The **direct** host `db.<ref>.supabase.co` is IPv6-only and is
  unreachable from most cloud/CI environments.
- The script (`scripts/apply-migrations.mjs`) only applies migrations not already recorded in
  `supabase_migrations.schema_migrations`, and skips benign "already exists" / "does not exist"
  errors (e.g. Lovable-only `email_queue_*` functions). Any other error aborts the run.
- `supabase db push` (Supabase CLI) is the equivalent official tool if you prefer it.
