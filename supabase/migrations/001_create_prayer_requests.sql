-- Create prayer_requests table
create table public.prayer_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  phone       text,
  request     text not null,
  source      text not null check (source in ('web', 'sms')),
  status      text not null default 'active' check (status in ('active', 'archived', 'spam')),
  created_at  timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.prayer_requests enable row level security;

-- Authenticated users can read all prayers
create policy "Authenticated users can read prayers"
  on public.prayer_requests for select
  to authenticated
  using (true);

-- Authenticated users can update status (archive, flag spam)
create policy "Authenticated users can update prayers"
  on public.prayer_requests for update
  to authenticated
  using (true);

-- Authenticated users can delete prayers
create policy "Authenticated users can delete prayers"
  on public.prayer_requests for delete
  to authenticated
  using (true);

-- Anyone can insert (public web form + SMS webhook via service role)
create policy "Anyone can insert prayers"
  on public.prayer_requests for insert
  to anon, authenticated
  with check (true);
