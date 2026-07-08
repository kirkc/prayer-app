-- Admin hardening.
--
-- Migration 002 allowed users to update their own profile row, which would
-- also let them set role = 'admin' on themselves. Restrict updates to
-- display_name only; role changes must go through the service role (the
-- admin API, which verifies the caller is an admin server-side).

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
