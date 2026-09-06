-- prayer_requests.response_count: how many texts the team has SENT on this
-- request, the mirror of reply_count (017, texts received).
--
-- The card said "1 reply" on a thread showing four messages: three from the
-- team and one from the requester. reply_count was right about what it
-- counts, but the label describes the conversation, and the team's own half
-- of it lives in prayer_responses — service-role only since 013, so the feed
-- query could never see it. Denormalizing it here is the same move
-- prayed_count made in 002, for the same reason.

alter table public.prayer_requests add column response_count integer not null default 0;
grant select (response_count) on public.prayer_requests to authenticated;

create function public.sync_response_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.prayer_requests
      set response_count = response_count + 1
      where id = new.request_id;
  elsif (tg_op = 'DELETE') then
    update public.prayer_requests
      set response_count = greatest(response_count - 1, 0)
      where id = old.request_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.sync_response_count() from public, anon, authenticated;

create trigger prayer_responses_count_insert
  after insert on public.prayer_responses
  for each row execute function public.sync_response_count();

create trigger prayer_responses_count_delete
  after delete on public.prayer_responses
  for each row execute function public.sync_response_count();

-- Every reply sent before this migration.
update public.prayer_requests r
  set response_count = c.n
  from (select request_id, count(*) as n from public.prayer_responses group by request_id) c
  where c.request_id = r.id;
