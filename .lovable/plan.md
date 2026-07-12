## Problem

The new `prevent_profile_privilege_escalation` trigger is blocking legitimate signup. When a new user finishes registering, `createFirmForCurrentUser` uses the admin client to write `firm_id` and `role` onto their profile for the first time. The trigger raises "role, is_super_admin, and firm_id cannot be changed via the API" because the service-role detection (`current_user = 'service_role'` / `request.jwt.claim.role = 'service_role'`) does not fire reliably with the new `sb_secret_…` Supabase key that this project uses (documented in AGENTS.md — the same reason `prevent_firm_billing_changes` needs a manual GUC set).

Result: no one can complete signup; the payment/onboarding screen is unreachable.

## Fix

Update the trigger so it still blocks privilege escalation but permits the one-time bootstrap writes signup needs. Concretely, allow the change when the field is transitioning **from NULL to a value** (initial assignment), and keep blocking every subsequent change:

- `firm_id`: allow `NULL → <uuid>`; block any other change.
- `role`: allow `NULL → <role>`; block any other change.
- `is_super_admin`: always blocked via the API (only super_admin or true service_role can flip it).

Super admins and real service-role sessions continue to bypass the trigger entirely (unchanged). This preserves the security finding fix (`profiles_admin_update_privilege_escalation`, `profiles_self_update_privilege_escalation`) — a normal authenticated user still cannot elevate `role`, move themselves between firms, or grant super-admin — while unblocking the first-time signup write.

## Changes

- New migration replacing `public.prevent_profile_privilege_escalation()` with the NULL→value allowance described above. Trigger definition itself does not change.
- No application code changes.

## Verification

- After the migration, sign up as a new user and confirm `/post-auth` completes and routes to `/register?step=payment` (or `/onboarding`) instead of showing the error toast.
- Confirm an authenticated user still cannot `UPDATE profiles SET role='principal'` on their own row (should raise the same exception).
