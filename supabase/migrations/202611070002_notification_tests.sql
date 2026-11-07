-- Additive, private notification-only test ledger. This migration queues nothing.
begin;
create table if not exists public.notification_test_deliveries (
  test_id text not null check (test_id ~ '^notification-test-v1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  channel text not null check (channel in ('gmail', 'telegram')),
  queued_at timestamptz not null default transaction_timestamp(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'needs_review')),
  claim_token uuid,
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb check (octet_length(result::text) <= 16384),
  primary key (test_id, channel)
);
alter table public.notification_test_deliveries enable row level security;
revoke all on public.notification_test_deliveries from public, anon, authenticated, service_role;

create or replace function public.protect_notification_test_identity() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if row(new.test_id, new.channel, new.queued_at) is distinct from row(old.test_id, old.channel, old.queued_at) then
    raise exception 'Notification test identity is immutable';
  end if;
  return new;
end $$;
drop trigger if exists protect_notification_test_identity on public.notification_test_deliveries;
create trigger protect_notification_test_identity before update on public.notification_test_deliveries
for each row execute function public.protect_notification_test_identity();

-- Only the database owner can intentionally queue a test. Neither service-role
-- RPCs, app sessions, GET requests, nor this migration can create a test request.
create or replace function public.claim_notification_tests()
returns setof public.notification_test_deliveries
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Never reclaim a sending row: Telegram has no idempotency guarantee. Even
  -- a process crash before sending is held for manual reconciliation, not retried.
  update public.notification_test_deliveries
  set status = 'needs_review', finished_at = clock_timestamp(),
      result = jsonb_build_object('errorCode', case when status = 'sending' then 'outcome_unknown' else 'test_expired' end)
  where (status = 'sending' and claimed_at <= clock_timestamp() - interval '5 minutes')
     or (status = 'pending' and queued_at <= clock_timestamp() - interval '1 day');
  return query
  with due as (
    select test_id, channel from public.notification_test_deliveries
    where status = 'pending' and queued_at <= clock_timestamp()
      and queued_at > clock_timestamp() - interval '1 day'
    order by queued_at, test_id, channel for update skip locked limit 2
  )
  update public.notification_test_deliveries q
  set status = 'sending', claim_token = gen_random_uuid(), claimed_at = clock_timestamp()
  from due where q.test_id = due.test_id and q.channel = due.channel returning q.*;
end $$;

create or replace function public.finish_notification_test(
  p_test_id text, p_channel text, p_claim_token uuid, p_status text, p_result jsonb
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare changed integer;
begin
  if p_status is null or p_status not in ('sent', 'needs_review') or p_result is null
     or jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text) > 16384 then
    raise exception 'Invalid test result';
  end if;
  update public.notification_test_deliveries
  set status = p_status, result = p_result, finished_at = clock_timestamp()
  where test_id = p_test_id and channel = p_channel and claim_token = p_claim_token and status = 'sending';
  get diagnostics changed = row_count;
  return changed = 1;
end $$;
revoke all on function public.protect_notification_test_identity() from public, anon, authenticated, service_role;
revoke all on function public.claim_notification_tests(), public.finish_notification_test(text,text,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_notification_tests(), public.finish_notification_test(text,text,uuid,text,jsonb) to service_role;
commit;
