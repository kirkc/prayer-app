-- Org-scoped RLS: the enforcement half of the tenant layer (012 added the
-- schema; the app already writes org_id everywhere). One transaction — either
-- the whole security model switches or none of it does.
--
-- Also closes long-standing gaps while every policy is being rewritten:
--   gap 1: anon held full default grants on every table (only the absence of
--          policies stood between the anon key and phone numbers)
--   gap 2: authenticated could UPDATE every prayer_requests column (incl.
--          phone) with no WITH CHECK
--   gap 3: stray table grants on profiles / prayer_responses
--   gap 4: (EXECUTE revoked in 012) the no-arg stats function is dropped now
--          that the app calls the org-scoped version
--
-- Rollback: supabase/rollback/013_org_rls_rollback.sql (restores the 001/002
-- policies and grants the app functionally depends on).

-- The app has written org_id on every insert since the v-A deploy. Re-run the
-- 012 backfill first anyway: rows created in the window between 012 applying
-- and that deploy going live have org_id NULL, and they belong to Redemption
-- (the only org that existed). Idempotent — no-ops when there are no NULLs.
update public.profiles         set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;
update public.prayer_requests  set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;
update public.prayer_responses set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;
update public.message_log      set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;

alter table public.profiles         alter column org_id set not null;
alter table public.prayer_requests  alter column org_id set not null;
alter table public.prayer_responses alter column org_id set not null;

-- ---------------------------------------------------------------------------
-- Invite-only membership, enforced at the database. Public signup can set
-- user_metadata but never app_metadata, so the marker the invite route stamps
-- via auth.admin.createUser is unforgeable from the anon key. Anyone hitting
-- /auth/v1/signup directly now fails profile creation, which aborts the
-- signup transaction entirely. (Also disable public signup in the Supabase
-- dashboard — this is the in-depth defense, not the only line.)
-- Note: this means members can ONLY be created through the app's invite flow;
-- a user added by hand in the Supabase dashboard will be rejected.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if coalesce(new.raw_app_meta_data ->> 'invited', '') <> 'true' then
    raise exception 'membership is invite-only; use the app''s invite flow';
  end if;

  v_org := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;
  if v_org is null then
    raise exception 'invite metadata is missing org_id';
  end if;

  insert into public.profiles (id, display_name, org_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_org
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- prayer_requests: signed in ⇒ sees own church only.
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can read prayers"   on public.prayer_requests;
drop policy "Authenticated users can update prayers" on public.prayer_requests;
drop policy "Authenticated users can delete prayers" on public.prayer_requests;
drop policy "Anyone can insert prayers"              on public.prayer_requests;

create policy "members read own-org requests"
  on public.prayer_requests for select
  to authenticated
  using (org_id = (select public.get_my_org_id()));

create policy "members triage own-org requests"
  on public.prayer_requests for update
  to authenticated
  using      (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));

create policy "members delete own-org requests"
  on public.prayer_requests for delete
  to authenticated
  using (org_id = (select public.get_my_org_id()));

-- No INSERT policy: both ingest paths (public form, SMS webhook) write with
-- the service role, which is exempt from RLS.

-- The triage route only ever sets status; nothing else about a request is
-- client-editable. This also ends the ability to overwrite phone (gap 2).
revoke update on public.prayer_requests from authenticated;
grant update (status) on public.prayer_requests to authenticated;

-- The column-level SELECT privacy from 002/011 (no phone / notify_prayers /
-- prayers_notified_at for authenticated) is deliberately untouched.

-- ---------------------------------------------------------------------------
-- profiles: the roster is per-church.
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can read profiles" on public.profiles;
create policy "members read own-org roster"
  on public.profiles for select
  to authenticated
  using (org_id = (select public.get_my_org_id()));

drop policy "Users can update their own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke insert, delete on public.profiles from authenticated;  -- gap 3

-- ---------------------------------------------------------------------------
-- prayers: the feed only ever reads the viewer's own marks (lib/prayers.ts),
-- and inserting against another church's request is blocked by the request
-- being invisible under the caller's RLS.
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can read prayers records" on public.prayers;
create policy "users read own prayer marks"
  on public.prayers for select
  to authenticated
  using (profile_id = auth.uid());

drop policy "Users can record their own prayer" on public.prayers;
create policy "users pray within their org"
  on public.prayers for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.prayer_requests r where r.id = request_id
    )
  );

-- "Users can remove their own prayer" (002) stays as-is.

-- ---------------------------------------------------------------------------
-- prayer_responses: service-role only, like the ops tables. The one client
-- read (admin recent-replies) moved to the service client in the v-A deploy.
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can read responses" on public.prayer_responses;
revoke all on public.prayer_responses from anon, authenticated;  -- gap 3

-- ---------------------------------------------------------------------------
-- anon lockdown (gap 1): the anon key is only ever used for auth calls, never
-- table access — the public form and webhooks all write via the service role.
-- Default-privilege revokes keep future tables closed by default.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- gap 4: the app switched to admin_dashboard_stats(uuid) in the v-A deploy.
drop function public.admin_dashboard_stats();
