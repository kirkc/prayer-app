-- Emergency rollback for 013_org_rls: restores every policy and grant the app
-- FUNCTIONALLY depends on, exactly as they stood after migration 011.
--
-- Deliberately NOT restored (they were security holes with no user-visible
-- behavior, closed for good):
--   - anon's blanket table/function grants (gap 1)
--   - authenticated's all-columns UPDATE on prayer_requests (gap 2 — the app
--     only ever updates status)
--   - stray INSERT/DELETE grants on profiles, INSERT/UPDATE/DELETE on
--     prayer_responses (gap 3)
--   - the no-arg admin_dashboard_stats() (the deployed app calls the uuid
--     version; recreate from migration 008 only if reverting the app too)
--
-- Run in one transaction. Safe to run whether or not 013 fully applied
-- (drop ... if exists / create policy will error on duplicates — run the
-- drops first as written).

begin;

alter table public.profiles         alter column org_id drop not null;
alter table public.prayer_requests  alter column org_id drop not null;
alter table public.prayer_responses alter column org_id drop not null;

-- prayer_requests: back to the 001 policies
drop policy if exists "members read own-org requests"   on public.prayer_requests;
drop policy if exists "members triage own-org requests" on public.prayer_requests;
drop policy if exists "members delete own-org requests" on public.prayer_requests;

create policy "Authenticated users can read prayers"
  on public.prayer_requests for select to authenticated using (true);
create policy "Authenticated users can update prayers"
  on public.prayer_requests for update to authenticated using (true);
create policy "Authenticated users can delete prayers"
  on public.prayer_requests for delete to authenticated using (true);
create policy "Anyone can insert prayers"
  on public.prayer_requests for insert to anon, authenticated with check (true);

-- status stays the only client-updatable column (see header note)
grant update (status) on public.prayer_requests to authenticated;

-- profiles: back to 002's read-all + own-row update
drop policy if exists "members read own-org roster" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- prayers: back to 002's read-all + own-row insert
drop policy if exists "users read own prayer marks" on public.prayers;
create policy "Authenticated users can read prayers records"
  on public.prayers for select to authenticated using (true);

drop policy if exists "users pray within their org" on public.prayers;
create policy "Users can record their own prayer"
  on public.prayers for insert to authenticated with check (profile_id = auth.uid());

-- prayer_responses: restore the 002 read policy + the SELECT grant it needs
grant select on public.prayer_responses to authenticated;
create policy "Authenticated users can read responses"
  on public.prayer_responses for select to authenticated using (true);

commit;
