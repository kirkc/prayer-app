-- Inbound texts that are replies to us, not new requests.
--
-- People react to and answer the texts we send them (the ack, the daily
-- "someone prayed for you", a team member's reply). Apple relays a tapback to
-- a non-iMessage number as literal text — `Loved "…"` — and a person who
-- writes "Thank you so much" is answering, not asking. Until now every one of
-- those became a prayer request. This table is the inbound half of a
-- conversation; prayer_responses (002) is the outbound half.
--
-- Service-role only, like the ops tables (010): the webhook writes it, the
-- thread route reads it after an org check. A request's cascade delete (and
-- the REMOVE keyword, which deletes by phone) takes the thread with it.

create table public.inbound_messages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  request_id   uuid not null references public.prayer_requests(id) on delete cascade,
  phone        text not null,        -- E.164, the webhook's From
  body         text not null,
  kind         text not null check (kind in ('reaction', 'reply')),
  provider_id  text,                 -- Twilio SmsMessageSid; dedupes webhook retries
  received_at  timestamptz not null default now()
);

create unique index inbound_messages_provider_id_key on public.inbound_messages (provider_id)
  where provider_id is not null;
create index inbound_messages_request_idx on public.inbound_messages (request_id, received_at);

alter table public.inbound_messages enable row level security;
revoke all on public.inbound_messages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- prayer_requests.reply_count: how many text replies (not reactions) the
-- thread holds, so the feed can show "1 reply" without a second query. Kept
-- in sync by trigger, the same way prayed_count is (002).
-- ---------------------------------------------------------------------------
alter table public.prayer_requests add column reply_count integer not null default 0;
grant select (reply_count) on public.prayer_requests to authenticated;

create function public.sync_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    if new.kind = 'reply' then
      update public.prayer_requests
        set reply_count = reply_count + 1
        where id = new.request_id;
    end if;
  elsif (tg_op = 'DELETE') then
    if old.kind = 'reply' then
      update public.prayer_requests
        set reply_count = greatest(reply_count - 1, 0)
        where id = old.request_id;
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.sync_reply_count() from public, anon, authenticated;

create trigger inbound_messages_count_insert
  after insert on public.inbound_messages
  for each row execute function public.sync_reply_count();

create trigger inbound_messages_count_delete
  after delete on public.inbound_messages
  for each row execute function public.sync_reply_count();

-- ---------------------------------------------------------------------------
-- The webhook now asks two questions it never asked before: "what did we last
-- text this number?" and "what's this number's latest request?" Neither table
-- had an index on the phone column.
-- ---------------------------------------------------------------------------
create index prayer_requests_org_phone_created_idx
  on public.prayer_requests (org_id, phone, created_at desc)
  where phone is not null;
create index message_log_recipient_created_idx
  on public.message_log (recipient, created_at desc);
