-- Care loop: profiles, prayers, responses, and privacy hardening.
-- Builds on 001_create_prayer_requests.sql.

-- ---------------------------------------------------------------------------
-- profiles: maps Supabase auth users to a display name and app role.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'prayer' check (role in ('prayer', 'admin')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any team member can see who's on the team (needed to attribute prayers).
create policy "Authenticated users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may edit only their own profile.
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- Auto-create a profile whenever a new auth user is added.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1)
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- prayer_requests: add care-loop state and hide phone numbers from the client.
-- ---------------------------------------------------------------------------
alter table public.prayer_requests
  add column replied      boolean not null default false,
  add column prayed_count integer not null default 0;

-- Column-level privacy: authenticated dashboard users can read everything
-- EXCEPT the raw phone number. Only the service role (server-side, used for
-- sending replies) can read `phone`. This is enforced by the database, so an
-- accidental `select('*')` from the client will fail loudly instead of leaking.
revoke select on public.prayer_requests from authenticated;
grant select (id, name, request, source, status, created_at, replied, prayed_count)
  on public.prayer_requests to authenticated;

create index prayer_requests_created_at_idx on public.prayer_requests (created_at desc);
create index prayer_requests_status_idx     on public.prayer_requests (status);
create index prayer_requests_replied_idx    on public.prayer_requests (replied);

-- ---------------------------------------------------------------------------
-- prayers: records that a specific team member prayed for a specific request.
-- The unique constraint prevents a person from being counted twice.
-- ---------------------------------------------------------------------------
create table public.prayers (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prayed_at  timestamptz not null default now(),
  unique (request_id, profile_id)
);

alter table public.prayers enable row level security;

create policy "Authenticated users can read prayers records"
  on public.prayers for select
  to authenticated
  using (true);

create policy "Users can record their own prayer"
  on public.prayers for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "Users can remove their own prayer"
  on public.prayers for delete
  to authenticated
  using (profile_id = auth.uid());

create index prayers_request_id_idx on public.prayers (request_id);
create index prayers_profile_id_idx on public.prayers (profile_id);

-- Keep prayer_requests.prayed_count in sync with the prayers table.
create function public.sync_prayed_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.prayer_requests
      set prayed_count = prayed_count + 1
      where id = new.request_id;
  elsif (tg_op = 'DELETE') then
    update public.prayer_requests
      set prayed_count = greatest(prayed_count - 1, 0)
      where id = old.request_id;
  end if;
  return null;
end;
$$;

create trigger prayers_count_insert
  after insert on public.prayers
  for each row execute function public.sync_prayed_count();

create trigger prayers_count_delete
  after delete on public.prayers
  for each row execute function public.sync_prayed_count();

-- ---------------------------------------------------------------------------
-- prayer_responses: outbound SMS replies sent by the prayer team.
-- Rows are written server-side by the service role (which also sends the SMS),
-- so no client insert policy is granted.
-- ---------------------------------------------------------------------------
create table public.prayer_responses (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null references public.prayer_requests(id) on delete cascade,
  profile_id        uuid references public.profiles(id) on delete set null,
  body              text not null,
  sent_at           timestamptz not null default now(),
  twilio_message_sid text,
  status            text
);

alter table public.prayer_responses enable row level security;

create policy "Authenticated users can read responses"
  on public.prayer_responses for select
  to authenticated
  using (true);

create index prayer_responses_request_id_idx on public.prayer_responses (request_id);
