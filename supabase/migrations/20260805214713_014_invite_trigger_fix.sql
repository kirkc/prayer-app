-- Fix the invite-only enforcement from 013 for how GoTrue actually behaves:
-- auth.admin.createUser INSERTS the user first and applies the supplied
-- app_metadata in a follow-up UPDATE, so the invite marker is not visible to
-- an AFTER INSERT trigger. 013's raise therefore blocked the app's own
-- invite flow.
--
-- New model, same guarantee:
--   - INSERT without the marker → user allowed, NO profile created. A
--     profileless user has no org, so org-scoped RLS shows them nothing —
--     a self-signup via the public endpoint yields a harmless dangling
--     account. (Disabling public signup in the dashboard remains the
--     front-line fix; this is depth.)
--   - INSERT with the marker (future-proofing) or the marker arriving via
--     UPDATE (today's createUser behavior) → profile created in the org
--     named by the invite metadata; missing org raises so a misconfigured
--     invite fails loudly instead of creating an orgless member.

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
    return new;
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

create or replace function public.handle_user_invited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
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

create trigger on_auth_user_invited
  after update on auth.users
  for each row
  when (new.raw_app_meta_data ->> 'invited' = 'true')
  execute function public.handle_user_invited();
