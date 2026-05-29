# Fix: login bounce back to /login

## Root cause

`src/routes/_authenticated.tsx` calls `supabase.auth.getUser()` in `beforeLoad`. `beforeLoad` runs on both server and client. The browser Supabase client stores its session in `localStorage`, which the SSR worker cannot read, so on any SSR request to an authenticated route (e.g. `/admin`, `/dashboard`) `getUser()` resolves to `null` and the guard throws `redirect({ to: "/login" })`. The Lovable preview iframe forces full GETs on cross-route nav, so this fires every time post-auth navigates to `/admin`.

Confirmed via preview worker logs:

```
GET /admin?__lovable_sha=... → 307
GET /login                    → 200
```

## Change

Make the `_authenticated` guard a no-op on the server and only enforce on the client, where the persisted session is available. The server fns themselves are still protected by `requireSupabaseAuth`, so this does not weaken security — it only stops the SSR-time false-negative redirect.

`src/routes/_authenticated.tsx`:

```ts
beforeLoad: async () => {
  // Session lives in localStorage; SSR can't see it. The client will re-run
  // this guard after hydration, and every server fn is independently gated
  // by requireSupabaseAuth, so skipping on the server is safe.
  if (typeof window === "undefined") return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw redirect({ to: "/login" });
  }
},
```

No other files change. No DB or server-fn changes.

## Verification

1. Sign out, sign in with Google.
2. Confirm post-auth lands on `/admin` (super admin) or `/dashboard` (regular user) and stays there.
3. Visit `/dashboard` directly while signed out → still redirected to `/login` (client-side guard fires after hydration).
4. Check preview worker logs: `/admin` returns 200, not 307.
