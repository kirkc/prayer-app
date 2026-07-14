-- Compute the 30-day window inside the function instead of taking it as an
-- argument, so the caller doesn't pass a JS-side timestamp (keeps the server
-- component pure and uses the DB clock as the single source of truth).
drop function if exists public.admin_dashboard_stats(uuid, timestamptz);

create or replace function public.admin_dashboard_stats(p_user uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'recent_prayers', (select count(*) from public.prayers where prayed_at >= now() - interval '30 days'),
    'recent_people',  (select count(distinct request_id) from public.prayers where prayed_at >= now() - interval '30 days'),
    'recent_replies', (select count(*) from public.prayer_responses where sent_at >= now() - interval '30 days'),
    'total_prayers',  (select count(*) from public.prayers),
    'total_people',   (select count(distinct request_id) from public.prayers),
    'total_replies',  (select count(*) from public.prayer_responses),
    'my_prayers',     (select count(*) from public.prayers where profile_id = p_user),
    'my_replies',     (select count(distinct request_id) from public.prayer_responses where profile_id = p_user)
  );
$$;

grant execute on function public.admin_dashboard_stats(uuid) to service_role;
