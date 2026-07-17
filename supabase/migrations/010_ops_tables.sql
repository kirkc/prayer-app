-- Operations tables backing the super-admin dashboard (/admin/ops):
--   app_errors  — persisted application errors (today they vanish into
--                 ephemeral Vercel function logs)
--   message_log — every outbound SMS and email, updated with delivery
--                 status by the Twilio status callback and Resend webhooks
--   cron_runs   — a record of every scheduled-job run (cron or manual)
--
-- All three are service-role only: RLS is enabled with no policies and all
-- privileges are revoked from anon/authenticated. Access goes exclusively
-- through super-admin-guarded API routes and server components using the
-- service client (the same trust model as `phone` on prayer_requests).

create table public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  scope       text not null,          -- e.g. 'sms.ack', 'cron.notifications.digest_send'
  message     text not null,
  detail      jsonb,                  -- serialized error + context
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index app_errors_created_at_idx on public.app_errors (created_at desc);
create index app_errors_unresolved_idx on public.app_errors (created_at desc)
  where resolved_at is null;

create table public.message_log (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  channel           text not null check (channel in ('sms', 'email')),
  kind              text not null,    -- 'sms.ack' | 'email.digest' | 'auth.invite' | ...
  recipient         text not null,    -- E.164 phone or email address
  subject           text,             -- email only
  body_preview      text,             -- first 160 chars
  status            text not null default 'sent' check (status in
    ('sent', 'delivered', 'failed', 'undelivered', 'bounced', 'complained', 'delayed')),
  provider_id       text,             -- Twilio MessageSid / Resend email id
  error_code        text,
  error_message     text,
  status_updated_at timestamptz,
  meta              jsonb             -- { request_id, profile_id, ... }
);

create unique index message_log_provider_id_key on public.message_log (provider_id)
  where provider_id is not null;
create index message_log_created_at_idx on public.message_log (created_at desc);
create index message_log_status_idx on public.message_log (status);

create table public.cron_runs (
  id           uuid primary key default gen_random_uuid(),
  job          text not null check (job in ('notifications', 'prayer-updates')),
  trigger      text not null default 'cron' check (trigger in ('cron', 'manual')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  summary      jsonb,
  triggered_by uuid references public.profiles(id) on delete set null
);

create index cron_runs_job_idx on public.cron_runs (job, started_at desc);

alter table public.app_errors  enable row level security;
alter table public.message_log enable row level security;
alter table public.cron_runs   enable row level security;

revoke all on public.app_errors  from anon, authenticated;
revoke all on public.message_log from anon, authenticated;
revoke all on public.cron_runs   from anon, authenticated;
