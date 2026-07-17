-- Web requesters can leave a phone number for prayer-update texts, which
-- means the team can also reply to them — but the browser must never see the
-- number itself (migration 002). Expose only its presence: a generated
-- boolean the feed can select, so the Respond button can appear for any
-- request we can actually text.

alter table public.prayer_requests
  add column has_phone boolean generated always as (phone is not null) stored;

grant select (has_phone) on public.prayer_requests to authenticated;
