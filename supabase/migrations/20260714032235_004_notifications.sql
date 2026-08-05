-- Per-user email notification preferences.
--
-- Lets each prayer-team member choose whether to be emailed about new prayer
-- requests, and at what cadence. Digests (daily/weekly) are sent by a Vercel
-- Cron job hitting /api/cron/notifications; `notify_last_sent_at` is the cursor
-- that makes those digests idempotent.

alter table public.profiles
  add column notify_new_requests boolean not null default true,
  add column notify_frequency    text    not null default 'immediate'
    check (notify_frequency in ('immediate', 'daily', 'weekly')),
  add column notify_last_sent_at timestamptz;

-- Migration 003 narrowed the authenticated UPDATE grant to display_name only
-- (so users can't self-promote to admin). Re-grant it to also cover the two
-- preference columns a user is allowed to edit. `notify_last_sent_at` is left
-- out on purpose — only the service role (cron / fan-out) writes it.
grant update (display_name, notify_new_requests, notify_frequency)
  on public.profiles to authenticated;
