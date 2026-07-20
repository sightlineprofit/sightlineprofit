# Sightline — Cursor Migration Guide

This document explains what this codebase is, exactly where it depends on
[Lovable](https://lovable.dev), and gives a step‑by‑step plan for (A) running it
locally and (B) fully disconnecting it from Lovable so it can live in a normal
local / self‑hosted development workflow.

> **TL;DR** — The app already runs locally with `npm install && npm run dev`
> (verified: it boots on `http://localhost:8080/` and returns HTTP 200). The
> Lovable `@lovable.dev/*` packages install from the public npm registry, so
> nothing is *blocking*. "Disconnecting Lovable" is about replacing four Lovable
> packages/services (build config, OAuth, email, and the Stripe connector
> gateway) with standard equivalents, and taking ownership of the remote
> Supabase project.

---

## 1. What this codebase is

**Sightline** is a financial‑architecture / practice‑management SaaS for
interior‑design firm owners. It is a single application (not a monorepo).

### Tech stack

| Layer | Technology |
| --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) (SSR) + TanStack Router (file‑based routing) |
| UI | React 19, Tailwind CSS v4, Radix UI + shadcn/ui (`new-york` style), lucide icons |
| Build | Vite 7, Nitro (default build target: **Cloudflare Workers**) |
| Data / Auth | **Remote hosted Supabase** (Postgres + Auth), `@supabase/supabase-js` |
| Server logic | TanStack "server functions" (`src/lib/*.functions.ts`) + server routes |
| Billing | Stripe (`@stripe/*`, `stripe`) — routed through Lovable's connector gateway |
| Email | Lovable Cloud email API + a Postgres/pgmq queue, `react-email` for templates |
| Package manager | `bun` preferred (`bun.lock`, `bunfig.toml`); `npm` also committed (`package-lock.json`) and works |
| Tests | **None configured** (no `test` script, no test files) |

### Project layout

```
.
├── .env                     # committed: public Supabase URL + anon/publishable key
├── .env.development         # committed: Stripe test publishable key (VITE_PAYMENTS_CLIENT_TOKEN)
├── .lovable/                # Lovable project metadata (template id, plan notes)  ← Lovable
├── AGENTS.md                # detailed operational notes (Lovable-generated)
├── bunfig.toml              # bun config incl. a Lovable-specific registry-age exclude ← Lovable
├── components.json          # shadcn/ui config
├── vite.config.ts           # thin wrapper around @lovable.dev/vite-tanstack-config ← Lovable
├── supabase/
│   ├── config.toml          # Supabase project_id
│   └── migrations/*.sql      # ~45 SQL migrations (schema, RLS, pgmq email infra, triggers)
├── public/
└── src/
    ├── router.tsx           # TanStack Router setup
    ├── server.ts            # SSR entry + error wrapper
    ├── start.ts             # global request/function middleware
    ├── routeTree.gen.ts     # AUTO-GENERATED — do not edit by hand
    ├── routes/              # file-based routes
    │   ├── __root.tsx, index.tsx, login.tsx, register.tsx, post-auth.tsx, ...
    │   ├── _authenticated/  # gated app (dashboard, settings, sightline, time-calendar, ...)
    │   ├── api/public/stripe-webhook.ts
    │   └── lovable/email/queue/process.ts   ← Lovable email queue worker
    ├── lib/                 # server functions (*.functions.ts) + shared logic
    │   ├── stripe.server.ts # Stripe client via Lovable connector gateway ← Lovable
    │   └── ...
    ├── integrations/
    │   ├── lovable/index.ts             # Lovable OAuth wrapper ← Lovable
    │   └── supabase/                     # client, client.server (admin), auth middleware/attacher, types
    ├── components/          # ui/ (shadcn), auth/, billing/, dashboard/, shell/, ...
    └── hooks/               # use-auth, use-realtime-invalidate, use-mobile, ...
```

### How auth & data flow works (so you know what you're changing)

- **Client Supabase client** (`src/integrations/supabase/client.ts`) is created
  from `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Handles login/signup
  and client‑side reads under RLS.
- **`useAuth`** (`src/hooks/use-auth.ts`) subscribes to Supabase auth state.
- **Server functions** attach the user's bearer token via
  `attachSupabaseAuth` (client middleware in `src/start.ts`) and validate it
  server‑side via `requireSupabaseAuth` (`auth-middleware.ts`).
- **Admin client** (`src/integrations/supabase/client.server.ts`) uses
  `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for trusted server operations. **Most
  server functions need this key or they throw.**

---

## 2. Where Lovable is wired in (the dependency inventory)

There are **four** Lovable npm packages plus several Lovable‑hosted services and
metadata files.

### 2.1 npm packages (`package.json`)

| Package | Type | What it does | Used in |
| --- | --- | --- | --- |
| `@lovable.dev/vite-tanstack-config` | devDependency | **The entire build config.** Bundles `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, `nitro` (Cloudflare target), `componentTagger` (dev), `VITE_*` env injection, the `@` path alias, React/TanStack dedupe, error‑logger plugins, and dev server host/port (`8080`). | `vite.config.ts` |
| `@lovable.dev/cloud-auth-js` | dependency | Hosted **OAuth** (Google/Apple/Microsoft) via Lovable, then hands tokens to Supabase. | `src/integrations/lovable/index.ts` → `GoogleButton.tsx`, `register.tsx` |
| `@lovable.dev/email-js` | dependency | `sendLovableEmail()` — sends email through Lovable's email API. | `src/routes/lovable/email/queue/process.ts` |
| `@lovable.dev/webhooks-js` | dependency | Transitive dep of `email-js` (not imported directly in `src/`). | (indirect) |

### 2.2 Lovable‑hosted services (no package, but external dependency)

- **Stripe connector gateway** — `src/lib/stripe.server.ts` rewrites every
  Stripe API call to `https://connector-gateway.lovable.dev/stripe` and adds a
  `Lovable-API-Key` header. So billing currently flows *through Lovable*.
- **Lovable email API** — the queue worker posts to Lovable's send endpoint
  (`LOVABLE_API_KEY`, optional `LOVABLE_SEND_URL`).
- **Lovable OAuth** — `createLovableAuth()` performs the OAuth redirect dance on
  Lovable infrastructure.

### 2.3 Lovable metadata / config files

- `.lovable/project.json` (template id), `.lovable/plan.md` (an AI plan note).
- `bunfig.toml` — has `minimumReleaseAgeExcludes = ["@lovable.dev/vite-tanstack-config"]`.
- `bun.lock` — resolves `@lovable.dev/*` (and many deps) from Lovable's **private
  GCP npm mirror** (`europe-west1-npm.pkg.dev/lovable-core-prod/...`). This mirror
  may be unreachable outside Lovable's sandbox, so **prefer `npm install`** (its
  `package-lock.json` resolves everything from the public `registry.npmjs.org`).
- Error strings like `"Connect Supabase in Lovable Cloud."` in the Supabase
  client files.
- `AGENTS.md` documents the Lovable-generated setup.

### 2.4 Environment variables

Committed (safe / public):
- `.env` → `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`,
  and the `VITE_`‑prefixed copies. Currently points at Supabase project
  `ncekwpeojcutmunadrbj`.
- `.env.development` → `VITE_PAYMENTS_CLIENT_TOKEN` (Stripe **test** publishable key).

**Not committed — you must supply these** (as needed):
- `SUPABASE_SERVICE_ROLE_KEY` — **required** for virtually all server functions
  (firm creation, pricing quote, admin, billing, team, email worker).
- `STRIPE_SANDBOX_API_KEY` / `STRIPE_LIVE_API_KEY`, `PAYMENTS_SANDBOX_WEBHOOK_SECRET`
  / `PAYMENTS_LIVE_WEBHOOK_SECRET` — billing/checkout & webhook verification.
- `LOVABLE_API_KEY` (+ optional `LOVABLE_SEND_URL`) — Lovable email + Stripe gateway.
- `PUBLIC_APP_URL` — used by `firm.functions.ts` for building callback URLs.

---

## 3. Part A — Run it locally *as‑is* (fastest path, ~5 minutes)

This keeps the Lovable packages (they install fine from public npm). This is the
recommended first step so you have a known‑good baseline before refactoring.

### Prerequisites
- **Node.js 20+** (verified working on Node 24) and **npm 10+**.
- (Optional) [`bun`](https://bun.sh) if you prefer it — but see the `bun.lock`
  caveat in §2.3; `npm` is the safer default off‑platform.
- (Optional) [Supabase CLI](https://supabase.com/docs/guides/cli) if you want to
  own/push the database schema.

### Steps

1. **Install dependencies** (use npm to avoid the Lovable private mirror):

```bash
npm install
```

2. **Provide the server secret.** The public `.env` is enough for the UI and
   client‑side auth, but server functions need the service‑role key. Put secrets
   in a git‑ignored `.env.local` (Vite loads `.env.local` and it overrides `.env`;
   `*.local` is already in `.gitignore`):

```bash
# .env.local  (DO NOT COMMIT)
SUPABASE_SERVICE_ROLE_KEY="sb_secret_...or...service_role_JWT_for_your_project"
# Optional, only if you exercise these features:
# LOVABLE_API_KEY="..."
# STRIPE_SANDBOX_API_KEY="sk_test_..."
# PAYMENTS_SANDBOX_WEBHOOK_SECRET="whsec_..."
# PUBLIC_APP_URL="http://localhost:8080"
```

> ⚠️ The `SUPABASE_*` values in `.env` must point at a Supabase project **you
> control** and whose schema matches `supabase/migrations/`. The committed value
> (`ncekwpeojcutmunadrbj`) is a Lovable‑provisioned project you likely can't
> administer. See §5 to point the app at your own project.

3. **Start the dev server:**

```bash
npm run dev      # → http://localhost:8080/
```

4. **Useful scripts:**

```bash
npm run build:dev   # Nitro/Cloudflare dev build → .output/
npm run build       # production build
npm run preview     # preview a build
npm run lint        # ESLint (currently reports many PRE-EXISTING errors — not a setup failure)
npm run format      # Prettier autofix
```

### What works with which secret

| Feature | Needs |
| --- | --- |
| UI, pages, client login/signup | `.env` publishable key only |
| Pricing quote, firm creation, dashboard/admin/team/billing server fns | `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe checkout / payment gate on `/register` | Stripe keys **+** `LOVABLE_API_KEY` (current gateway) |
| Outbound email queue | `LOVABLE_API_KEY` + service‑role key |

---

## 4. Part B — Fully disconnect from Lovable

Do these in order. After each step, re‑run `npm run dev` to confirm the app still
boots. Steps 1–2 are the ones that actually remove build/runtime coupling;
steps 3–4 only matter if you use email/billing; steps 5–7 are cleanup.

### Step 1 — Replace the Vite build config (`@lovable.dev/vite-tanstack-config`)

This is the biggest change. The Lovable package silently assembles all the Vite
plugins. To own the build, replace `vite.config.ts` with an explicit config using
the individual plugins (all already transitively available, but add the missing
ones explicitly).

1. Add the plugins the wrapper was providing:

```bash
npm install -D @tanstack/react-start @tanstack/router-plugin @vitejs/plugin-react @tailwindcss/vite vite-tsconfig-paths
# nitro is already a devDependency
```

2. Rewrite `vite.config.ts` (replace the Lovable import) with something like:

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { port: 8080, host: true, strictPort: true },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
  ],
});
```

3. **Drop `componentTagger`** (a Lovable dev‑only plugin for their editor — not
   needed locally).
4. **Choose a deploy target.** The Lovable config defaulted Nitro to Cloudflare
   Workers. Configure Nitro/TanStack Start for your target (Node server, Vercel,
   Netlify, or keep Cloudflare) explicitly. For a plain Node server this is the
   TanStack Start default; adjust `server.entry` handling in `src/server.ts` if
   you no longer need the Cloudflare `fetch(request, env, ctx)` signature.
5. Remove the dependency:

```bash
npm uninstall @lovable.dev/vite-tanstack-config
```

6. Delete the now‑stale comment block at the top of `vite.config.ts`.

> Verify: `npm run dev` still serves on `:8080`, and `npm run build` produces a
> build for your chosen target.

### Step 2 — Replace Lovable OAuth (`@lovable.dev/cloud-auth-js`)

Supabase can do Google OAuth directly; you don't need Lovable's hosted flow.

1. In the **Supabase dashboard** → Authentication → Providers → Google, add your
   own Google OAuth **client ID/secret** and set the redirect URL
   (`https://<your-project>.supabase.co/auth/v1/callback`).
2. Rewrite `src/integrations/lovable/index.ts` to call Supabase natively:

```ts
import { supabase } from "../supabase/client";

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google",
      opts?: { redirect_uri?: string },
    ) =>
      supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: opts?.redirect_uri },
      }),
  },
};
```

   (Or rename this module to `src/integrations/auth` and update the two callers:
   `src/components/auth/GoogleButton.tsx` and `src/routes/register.tsx`.)
3. Remove the package:

```bash
npm uninstall @lovable.dev/cloud-auth-js
```

> If you don't need social login at all, delete `GoogleButton` usage and skip
> the Supabase provider setup.

### Step 3 — Replace Lovable email (`@lovable.dev/email-js`)

Only relevant if you send transactional/auth emails. The queue infrastructure
(pgmq tables, `email_send_log`, TTL/retry logic in
`src/routes/lovable/email/queue/process.ts`) is provider‑agnostic — only the
`sendLovableEmail(...)` call is Lovable‑specific. Templates already use
`react-email` / `@react-email/components`.

1. Pick a provider (e.g. **Resend**, Postmark, SES, or SMTP). Install its SDK.
2. Replace the `sendLovableEmail(...)` call in `process.ts` with the provider's
   send call (render your `react-email` templates to HTML/text first).
3. Remove the packages:

```bash
npm uninstall @lovable.dev/email-js @lovable.dev/webhooks-js
```

4. Rename the route folder `src/routes/lovable/email/...` → e.g.
   `src/routes/internal/email/...` and update the pg_cron job that calls it.

> If you don't need email yet, you can leave the queue dormant (nothing calls it
> until a cron job does) and defer this step.

### Step 4 — Replace the Stripe connector gateway

`src/lib/stripe.server.ts` currently proxies Stripe through
`https://connector-gateway.lovable.dev/stripe` using a `Lovable-API-Key`. Point
it straight at Stripe with your own secret key:

1. In `createStripeClient`, remove the custom `httpClient` gateway rewrite and
   the `Lovable-API-Key` header, and construct Stripe normally:

```ts
export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getConnectionApiKey(env), { apiVersion: "2026-03-25.dahlia" });
}
```

2. Set `STRIPE_SANDBOX_API_KEY` (test) / `STRIPE_LIVE_API_KEY` (live) to your own
   Stripe secret keys, and drop the `LOVABLE_API_KEY` requirement here.
3. Configure your Stripe products/prices to match the `lookup_key`s in
   `PRICE_TO_TIER` / `CHECKOUT_PRICE_KEYS` (`stripe.server.ts`), and set the
   webhook secrets (`PAYMENTS_*_WEBHOOK_SECRET`) for
   `src/routes/api/public/stripe-webhook.ts`.

> If you don't use billing, you can skip this, but note `/post-auth` routes new
> firms to `/register?step=payment` — see AGENTS.md for how to bypass the payment
> gate during development (set `subscription_status='active'` on the firm).

### Step 5 — Own the Supabase project (database)

The "backend" is a remote hosted Supabase project. Disconnecting from Lovable
means making sure **you** administer it.

1. Create your own Supabase project (or take ownership of the existing one).
2. Update `.env` (and `supabase/config.toml`'s `project_id`) with **your**
   project's URL, project id, and publishable/anon key. Put the service‑role key
   in `.env.local`.
3. Apply the schema with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push        # applies supabase/migrations/*.sql
```

   Notes from `AGENTS.md`: a few migrations `REVOKE`/`ALTER` Lovable‑provisioned
   functions (`email_queue_dispatch`, `email_queue_wake`) that may not exist —
   those statements can be safely skipped. The direct DB host is IPv6‑only; use
   the **Session/Transaction pooler** connection string if connecting directly.
4. Recreate any needed pg_cron jobs (e.g. the email queue processor) and Storage
   buckets in your own project.

### Step 6 — Clean up Lovable metadata

```bash
rm -rf .lovable
```

- Edit `bunfig.toml`: remove the `minimumReleaseAgeExcludes` Lovable entry (or
  delete `bunfig.toml` + `bun.lock` if standardizing on npm).
- Update the Supabase client error strings ("Connect Supabase in Lovable Cloud.")
  in `client.ts`, `client.server.ts`, `auth-middleware.ts` to something neutral.
- Update `AGENTS.md` / `README.md` to reflect the de‑Lovable'd setup.
- Remove the `// This file is auto-generated by Lovable` headers once you edit
  those files (`src/integrations/**`).

### Step 7 — Standardize the lockfile & finish

- Decide on **one** package manager. If npm: delete `bun.lock` and `bunfig.toml`,
  keep `package-lock.json`. If bun: regenerate `bun.lock` against the public
  registry (`bun install --registry https://registry.npmjs.org`) so it no longer
  references the Lovable GCP mirror.
- Re‑run: `npm install && npm run build && npm run dev`.
- Grep for stragglers:

```bash
rg -i "lovable" --hidden -g '!node_modules' -g '!*.lock'
```

  Expect remaining hits only where you consciously kept naming; aim for zero
  functional references to `@lovable.dev/*` or `*.lovable.dev`.

---

## 5. Quick reference — commands

```bash
# One-time
npm install

# Daily dev
npm run dev            # http://localhost:8080

# Build / preview
npm run build:dev
npm run build
npm run preview

# Quality
npm run lint           # NOTE: many pre-existing lint errors (expected)
npm run format

# Supabase schema (after Step 5)
supabase link --project-ref <ref>
supabase db push
```

## 6. Gotchas (from AGENTS.md, condensed)

- `npm run lint` exits non‑zero due to **thousands of pre‑existing** Prettier/
  ESLint errors — not a regression, just the repo's current state.
- `src/routeTree.gen.ts` is **auto‑generated** on dev/build — never hand‑edit or
  commit incidental changes.
- Do **not** manually add `tanstackStart`/`viteReact`/`tailwindcss`/`nitro`
  plugins *on top of* the Lovable config — that causes duplicate‑plugin breakage.
  (After Step 1 you own the plugin list directly, so this no longer applies.)
- Supabase project **requires email confirmation**; for E2E testing create a
  pre‑confirmed user via the admin API
  (`supabase.auth.admin.createUser({ email, password, email_confirm: true })`).
- New firms have no subscription, so `/post-auth` sends them to
  `/register?step=payment` (needs Stripe). To reach `/dashboard` without Stripe,
  set the firm's `subscription_status='active'` (a DB trigger guards billing
  columns — update via a direct DB session with
  `set request.jwt.claim.role='service_role';`).

---

## 7. Production cutover — sightlineprofit.com (Namecheap DNS)

A dedicated checklist lives in **`deploy/production-cutover.md`**. Summary:

| Step | Action |
|------|--------|
| 1 | Apply all `supabase/migrations/*.sql` to project `nizjqvbxrmxkkmnnqzpy` |
| 2 | Supabase Auth: Site URL + redirects → `https://sightlineprofit.com` |
| 3 | Google OAuth + Stripe live webhook → `https://sightlineprofit.com/api/public/payments/webhook?env=live` |
| 4 | Cloudflare account → add `sightlineprofit.com` |
| 5 | Namecheap → point nameservers to Cloudflare |
| 6 | `npm run build && npm run deploy` |
| 7 | Set Cloudflare worker secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_LIVE_API_KEY`, etc.) |
| 8 | Workers → Domains → attach `sightlineprofit.com` + `www` |
| 9 | Smoke test, then decommission Lovable hosting |

**Build config:** `vite.config.ts` no longer uses `@lovable.dev/vite-tanstack-config` — the app owns its Vite/Nitro/Cloudflare pipeline directly.

**Already migrated:** Stripe (`src/lib/stripe.server.ts` uses your keys directly), Google OAuth (`src/integrations/lovable/index.ts` uses Supabase native OAuth).

**Still on Lovable (optional):** outbound email via `@lovable.dev/email-js` until you swap the provider in `src/routes/lovable/email/queue/process.ts`.

---

*Generated during the Cursor migration review. The app was confirmed to
`npm install` and boot on `http://localhost:8080/` (HTTP 200) before this guide
was written.*
