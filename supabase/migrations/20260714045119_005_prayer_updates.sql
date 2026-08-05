-- "Someone prayed for you" updates to requesters.
--
-- Lets a requester receive a once-a-day text recapping how many people prayed
-- for their request. SMS requesters are auto-enrolled (their inbound message is
-- consent); web requesters opt in by providing a phone number on the form.
-- `prayers_notified_at` is both the digest-window cursor and the once-a-day guard.

alter table public.prayer_requests
  add column notify_prayers      boolean not null default false,
  add column prayers_notified_at timestamptz;

-- Everyone who has already texted in is enrolled (opt-out via STOP).
update public.prayer_requests set notify_prayers = true where source = 'sms';

-- Note: these columns are intentionally NOT added to the column-level SELECT
-- grant from migration 002 — they stay server-only, like `phone`. The client
-- feed never selects them.
