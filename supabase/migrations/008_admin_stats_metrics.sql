-- Simplify the admin stats to three communal actions (requests / prayers /
-- replies) for the recent window, plus all-time totals. Drops the personal
-- metrics — the overview stays team-wide. p_user is no longer needed.
drop function if exists public.admin_dashboard_stats(uuid);

create or replace function public.admin_dashboard_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'recent_requests', (select count(*) from public.prayer_requests where created_at >= now() - interval '30 days'),
    'recent_prayers',  (select count(*) from public.prayers where prayed_at >= now() - interval '30 days'),
    'recent_replies',  (select count(*) from public.prayer_responses where sent_at >= now() - interval '30 days'),
    'total_requests',  (select count(*) from public.prayer_requests),
    'total_people',    (select count(distinct request_id) from public.prayers),
    'total_replies',   (select count(*) from public.prayer_responses)
  );
$$;

grant execute on function public.admin_dashboard_stats() to service_role;

-- Keep the date-filtered counts index-fast as the tables grow (prayer_requests
-- already has a created_at index from migration 001).
create index if not exists prayers_prayed_at_idx on public.prayers (prayed_at);
create index if not exists prayer_responses_sent_at_idx on public.prayer_responses (sent_at);
