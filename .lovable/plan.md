Delete the stale /rate-architecture placeholder route and repoint navigation to the live /setup page.

1. Remove `src/routes/_authenticated/rate-architecture.tsx`
2. Update AppShell nav link from `/rate-architecture` → `/setup`
3. Route tree regenerates automatically on build

No database or server function changes needed.