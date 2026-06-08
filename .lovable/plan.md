## Fix Role Lock + CSS Build Error

### Problem 1: Your account is locked to `team` role
Your profile's `role` column is `team`, which triggers the redirect guard in `AppShell.tsx` that restricts navigation to only Time Calendar, Projects, Knowledge Base, Settings, and Welcome. Every other route gets intercepted with "That section is managed by your firm principal."

Most likely cause: you went through an invitation flow or some other path that overwrote your principal role.

### Problem 2: `styles.css` causes a 500 build error
`@source "../src"` is placed between two `@import` statements (lines 2 and 3). LightningCSS rejects this because `@import` must precede all non-`@charset`/`@layer` rules. The processed bundle reports line 4844 because Tailwind expands the file internally.

---

### Changes

1. **Fix CSS import order** (`src/styles.css`)
   - Move `@source "../src"` below all three `@import` statements so imports are contiguous at the top of the file.

2. **Add self-serve "Claim Principal" feature** (`src/lib/firm.functions.ts`, `src/routes/_authenticated/settings.tsx`)
   - New server function `claimPrincipalRole` that:
     - Reads the current user's profile + firm
     - Allows promotion ONLY if the user is the firm's `owner_id` OR the firm has no existing principal
     - Updates `profiles.role` to `principal`
   - Add a "Claim principal access" card in Settings (visible only when the current user is `team` but is the firm owner, or when no principal exists in the firm).
   - After claiming, invalidate the `me` query so navigation unlocks immediately.

3. **Fix the Settings page annual summary link**
   - Replace the `<a href="/dashboard/annual-summary">` with a `<Link>` component from TanStack Router for proper SPA navigation.

### No database migrations needed
Both issues are fixed with code changes only. The `role` column already exists on `profiles`.

### Expected result
- Preview builds successfully without the LightningCSS 500.
- You see a "Claim principal access" button in Settings → Profile.
- Clicking it promotes you to principal and all modules unlock immediately.