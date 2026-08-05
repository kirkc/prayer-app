-- Organizations: the tenant layer. Purely additive — no existing policy,
-- grant, or column changes. The app ignores org_id until the next deploy,
-- and RLS enforcement arrives separately in 013 once the app writes org_id
-- everywhere. Existing data is backfilled to Redemption Church Seattle.

create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                    check (slug ~ '^[a-z0-9](-?[a-z0-9])*$')
                    check (slug not in ('login','dashboard','settings','admin',
                                        'api','auth','orgs','set-password')),
  name            text not null,                      -- email eyebrow, invite copy, SMS signature
  timezone        text not null default 'America/Los_Angeles',
  twilio_phone    text unique,                        -- E.164; null = SMS features disabled
  from_email      text,                               -- 'Name <addr>'; null = neutral shared sender
  reply_to        text,
  allowed_origins text[] not null default '{}',       -- extra CORS origins for embedded forms
  created_at      timestamptz not null default now()
);

-- Service-role only, like the ops tables: RLS on with zero policies, and no
-- table grants for client roles. Org config includes operational details
-- (Twilio numbers, sender addresses) that browsers never need directly.
alter table public.organizations enable row level security;
revoke all on public.organizations from anon, authenticated;

-- Fixed literal UUID so app code and this backfill can reference it without a
-- lookup, and so branch replays produce the same id.
insert into public.organizations (id, slug, name, twilio_phone, from_email, allowed_origins)
values (
  '11111111-1111-4111-8111-111111111111',
  'redemption',
  'Redemption Church Seattle',
  '+12068886649',
  'Redemption Church Seattle <prayer@redemptionseattle.org>',
  array['https://kirkcastro.com', 'https://www.kirkcastro.com']
)
on conflict (slug) do nothing;

-- Nullable for now (NOT NULL lands in 013, after the app writes org_id on
-- every insert). prayers/app_errors/cron_runs deliberately get no org_id:
-- prayers inherit org through request_id, errors carry it in detail jsonb,
-- and cron runs are global with per-org detail in summary jsonb.
alter table public.profiles         add column org_id uuid references public.organizations(id);
alter table public.prayer_requests  add column org_id uuid references public.organizations(id);
alter table public.prayer_responses add column org_id uuid references public.organizations(id);
alter table public.message_log      add column org_id uuid references public.organizations(id);

update public.profiles         set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;
update public.prayer_requests  set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;
update public.prayer_responses set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;
update public.message_log      set org_id = '11111111-1111-4111-8111-111111111111' where org_id is null;

create index prayer_requests_org_status_created_idx
  on public.prayer_requests (org_id, status, created_at desc);
create index profiles_org_idx on public.profiles (org_id);
create index prayer_responses_org_idx on public.prayer_responses (org_id);

-- The caller's org, for RLS policies (013) and PostgREST clients. SECURITY
-- DEFINER so it works even as profiles' own SELECT policy tightens.
create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

revoke execute on function public.get_my_org_id() from public, anon;
grant execute on function public.get_my_org_id() to authenticated;

-- New members join the org named in their invite metadata. Until the invite
-- route sends org_id (next app deploy), fall back to Redemption — the only
-- org that can invite today. The fallback is removed in migration 014.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, org_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid,
      (select id from public.organizations where slug = 'redemption')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Org-scoped ministry stats. prayers has no org_id, so those counts join
-- through prayer_requests. Callable only by the service role, which passes
-- the admin's own org explicitly.
create function public.admin_dashboard_stats(p_org_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'recent_requests', (select count(*) from public.prayer_requests
                        where org_id = p_org_id and created_at >= now() - interval '30 days'),
    'recent_prayers',  (select count(*) from public.prayers p
                        join public.prayer_requests r on r.id = p.request_id
                        where r.org_id = p_org_id and p.prayed_at >= now() - interval '30 days'),
    'recent_replies',  (select count(*) from public.prayer_responses
                        where org_id = p_org_id and sent_at >= now() - interval '30 days'),
    'total_requests',  (select count(*) from public.prayer_requests where org_id = p_org_id),
    'total_people',    (select count(distinct p.request_id) from public.prayers p
                        join public.prayer_requests r on r.id = p.request_id
                        where r.org_id = p_org_id),
    'total_replies',   (select count(*) from public.prayer_responses where org_id = p_org_id)
  );
$$;

revoke execute on function public.admin_dashboard_stats(uuid) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats(uuid) to service_role;

-- Security fix: the no-arg version's EXECUTE was never revoked from PUBLIC,
-- so any anon PostgREST caller could read ministry-wide counts. The app only
-- ever calls it through the service role (which keeps its explicit grant from
-- 008), so this cannot break anything. The function itself is dropped in 013
-- once the app has switched to the org-scoped version.
revoke execute on function public.admin_dashboard_stats() from public, anon, authenticated;
