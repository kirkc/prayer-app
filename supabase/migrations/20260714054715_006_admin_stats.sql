-- Encouraging ministry stats for the admin overview.
--
-- One function returns the whole set so the page makes a single round trip and
-- distinct counts ("people prayed for") are computed in SQL. `p_since` bounds
-- the recent window (30 days); the totals are all-time; `my_*` is the caller.
create or replace function public.admin_dashboard_stats(p_user uuid, p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'recent_prayers', (select count(*) from public.prayers where prayed_at >= p_since),
    'recent_people',  (select count(distinct request_id) from public.prayers where prayed_at >= p_since),
    'recent_replies', (select count(*) from public.prayer_responses where sent_at >= p_since),
    'total_prayers',  (select count(*) from public.prayers),
    'total_people',   (select count(distinct request_id) from public.prayers),
    'total_replies',  (select count(*) from public.prayer_responses),
    'my_prayers',     (select count(*) from public.prayers where profile_id = p_user),
    'my_replies',     (select count(distinct request_id) from public.prayer_responses where profile_id = p_user)
  );
$$;

grant execute on function public.admin_dashboard_stats(uuid, timestamptz) to service_role;
