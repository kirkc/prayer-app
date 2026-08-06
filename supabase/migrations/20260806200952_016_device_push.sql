-- Push notifications: iOS device tokens + a per-member push preference.
-- device_tokens follows the ops-table model — RLS on, zero policies,
-- service-role only (the bearer-authenticated /api/devices route writes it).
-- notify_push is independent of notify_frequency: a member on a weekly email
-- digest still gets the instant tap on their phone.

create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  token        text not null unique,
  platform     text not null default 'ios' check (platform = 'ios'),
  environment  text not null check (environment in ('sandbox', 'production')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from anon, authenticated;
create index device_tokens_profile_idx on public.device_tokens (profile_id);

alter table public.profiles add column notify_push boolean not null default true;
-- Additive column grant: members may edit their own push preference (the 004
-- grant already covers display_name / notify_new_requests / notify_frequency).
grant update (notify_push) on public.profiles to authenticated;
