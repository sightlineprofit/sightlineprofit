## The bug

The `role` column on `public.profiles` has a NOT NULL default of `'team'`, so rows created by the `handle_new_user` trigger already have `role = 'team'` (never NULL). The previous fix only allowed `role` changes when `OLD.role IS NULL`, which never happens. So the first legitimate signup write — `createFirmForCurrentUser` upgrading the new user from `team` to `principal` — hits the trigger and raises "role cannot be changed via the API".

`firm_id` has no default and is nullable, so the NULL→value allowance already works for it; the trigger only trips on `role`.

## Fix

Update `prevent_profile_privilege_escalation` so the initial-bootstrap allowance keys off `OLD.firm_id IS NULL` (the reliable "user has not been placed in a firm yet" signal) instead of `OLD.<column> IS NULL`:

- If `OLD.firm_id IS NULL` (first-time firm assignment), allow both `firm_id` and `role` to change in this one UPDATE. `is_super_admin` still cannot flip.
- Once `OLD.firm_id IS NOT NULL`, block any change to `firm_id`, `role`, or `is_super_admin` (unchanged behavior).

Super admins and true `service_role` sessions continue to bypass entirely.

This keeps the two security findings fixed (a normal authenticated user still can't self-elevate `role`, move between firms, or grant super-admin — their `OLD.firm_id` is already set) while letting signup complete.

## Changes

- One new migration replacing `public.prevent_profile_privilege_escalation()` with the logic above. Trigger definition unchanged.
- No application code changes.

## Verification

- Sign up as a new user → `/post-auth` completes and routes to `/register?step=payment`.
- As an existing authenticated user, `UPDATE profiles SET role='principal' WHERE id = auth.uid()` still raises "role cannot be changed via the API".
