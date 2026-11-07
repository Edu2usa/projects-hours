-- Run once before deploying the entry-email code. This migration sends nothing.
-- Existing/administratively imported IDs are remembered, never queued for email.
begin;

create table if not exists public.hours_submission_receipts (
  submission_id text primary key,
  recorded_at timestamptz not null default clock_timestamp()
);

create table if not exists public.entry_email_outbox (
  submission_id text primary key references public.hours_submission_receipts(submission_id),
  delivery_id text not null unique check (delivery_id ~ '^hours-entry-v1-[0-9a-f]{64}$'),
  queued_at timestamptz not null default clock_timestamp(),
  message_text text check (octet_length(message_text) <= 100000),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'needs_review')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  last_error text,
  check (status = 'needs_review' or message_text is not null)
);
create index if not exists entry_email_due_idx on public.entry_email_outbox(next_attempt_at, queued_at)
  where status in ('pending', 'sending');

alter table public.hours_submission_receipts enable row level security;
alter table public.entry_email_outbox enable row level security;
-- No client policies. Even service-role access is through the limited RPCs below.
revoke all on public.hours_submission_receipts, public.entry_email_outbox from public, anon, authenticated, service_role;

create or replace function public.remember_hours_submission_ids() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare state jsonb;
begin
  if new.key = 'app_state' then
    state := coalesce(to_jsonb(new)->'value_json', to_jsonb(new)->'value');
    if jsonb_typeof(state->'entries') = 'array' then
      insert into public.hours_submission_receipts(submission_id)
        select distinct item->>'id' from jsonb_array_elements(state->'entries') item
        where nullif(item->>'id', '') is not null
        on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists remember_hours_submission_ids on public.settings;
create trigger remember_hours_submission_ids after insert or update on public.settings
for each row execute function public.remember_hours_submission_ids();

insert into public.hours_submission_receipts(submission_id)
select distinct item->>'id'
from public.settings s,
  lateral jsonb_array_elements(coalesce(to_jsonb(s)->'value_json', to_jsonb(s)->'value')->'entries') item
where s.key = 'app_state' and nullif(item->>'id', '') is not null
on conflict do nothing;

create or replace function public.protect_entry_email_snapshot() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if row(new.submission_id, new.delivery_id, new.queued_at, new.message_text)
     is distinct from row(old.submission_id, old.delivery_id, old.queued_at, old.message_text) then
    raise exception 'Email snapshot is immutable';
  end if;
  return new;
end $$;
drop trigger if exists protect_entry_email_snapshot on public.entry_email_outbox;
create trigger protect_entry_email_snapshot before update on public.entry_email_outbox
for each row execute function public.protect_entry_email_snapshot();

-- The entry and its snapshot commit together. A failed insert rolls both back.
-- The app's revision retry loop rebuilds the text if concurrent state changed.
create or replace function public.save_hours_entry_with_email(
  p_entry jsonb, p_expected_revision timestamptz,
  p_email_enabled boolean, p_delivery_id text, p_message_text text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  stored public.settings%rowtype;
  state jsonb;
  state_column text;
  next_revision timestamptz;
  submission_id text := p_entry->>'id';
begin
  select * into stored from public.settings where key = 'app_state' for update;
  if not found then
    raise exception 'App state must be initialized before accepting hours';
  end if;
  if stored.updated_at is distinct from p_expected_revision then
    return jsonb_build_object('configured', true, 'conflict', true);
  end if;
  state_column := case when to_jsonb(stored) ? 'value_json' then 'value_json' else 'value' end;
  state := to_jsonb(stored)->state_column;
  if jsonb_typeof(state->'entries') is distinct from 'array' then
    raise exception 'Invalid app state';
  end if;
  if submission_id is null or length(submission_id) < 1 or length(submission_id) > 200 then
    raise exception 'Invalid submission ID';
  end if;
  if exists (select 1 from public.hours_submission_receipts r where r.submission_id = p_entry->>'id')
     or exists (select 1 from jsonb_array_elements(state->'entries') item where item->>'id' = submission_id) then
    return jsonb_build_object('configured', true, 'duplicate', true);
  end if;

  state := jsonb_set(jsonb_set(state, '{entries}', jsonb_build_array(p_entry) || (state->'entries')), '{version}', '2');
  -- Ensure revisions are strictly increasing, even within the same millisecond.
  next_revision := greatest(clock_timestamp(), stored.updated_at + interval '1 millisecond');
  execute format('update public.settings set %I = $1, updated_at = $2 where key = ''app_state''', state_column)
    using state, next_revision;
  -- The state trigger has recorded this ID in this same transaction.
  if p_email_enabled is true then
    insert into public.entry_email_outbox(submission_id, delivery_id, message_text, status, last_error)
    values (submission_id, p_delivery_id,
      case when octet_length(p_message_text) <= 100000 then p_message_text else null end,
      case when p_message_text is not null and octet_length(p_message_text) <= 100000 then 'pending' else 'needs_review' end,
      case when p_message_text is not null and octet_length(p_message_text) <= 100000 then null else 'snapshot_too_large' end);
  end if;
  return jsonb_build_object('configured', true, 'revision', next_revision);
end $$;

create or replace function public.claim_entry_emails(p_limit integer default 5)
returns setof public.entry_email_outbox
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Expired leases may safely re-enter the RELAY with the same immutable ID/text.
  -- The relay's durable ledger, not a blind retry of Gmail, resolves uncertainty.
  update public.entry_email_outbox set status = 'needs_review', lease_token = null, lease_until = null,
    last_error = case when queued_at <= clock_timestamp() - interval '7 days' then 'queue_expired' else 'retry_limit' end
    where status in ('pending', 'sending')
      and (status = 'pending' or lease_until <= clock_timestamp())
      and (queued_at <= clock_timestamp() - interval '7 days' or attempts >= 10);

  return query
  with due as (
    select submission_id from public.entry_email_outbox
    where ((status = 'pending' and next_attempt_at <= clock_timestamp())
        or (status = 'sending' and lease_until <= clock_timestamp()))
      and attempts < 10 and queued_at > clock_timestamp() - interval '7 days'
    order by queued_at
    for update skip locked
    limit greatest(0, least(coalesce(p_limit, 5), 5))
  )
  update public.entry_email_outbox q
  set status = 'sending', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '5 minutes'
  from due where q.submission_id = due.submission_id returning q.*;
end $$;

create or replace function public.finish_entry_email(p_submission_id text, p_lease_token uuid, p_outcome text, p_error_code text default null)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare changed integer;
begin
  if p_outcome not in ('sent', 'retry', 'needs_review') then raise exception 'Invalid delivery outcome'; end if;
  if p_error_code is not null and p_error_code !~ '^[a-zA-Z0-9_:-]{1,80}$' then
    raise exception 'Invalid delivery error code';
  end if;
  update public.entry_email_outbox
  set status = case when p_outcome = 'retry' and attempts < 10 and queued_at > clock_timestamp() - interval '7 days'
                    then 'pending' when p_outcome = 'retry' then 'needs_review' else p_outcome end,
      next_attempt_at = clock_timestamp() + least(interval '6 hours', interval '10 minutes' * power(2, greatest(attempts - 1, 0))),
      sent_at = case when p_outcome = 'sent' then clock_timestamp() else sent_at end,
      last_error = case when p_outcome = 'retry' and attempts >= 10 then 'retry_limit'
                        when p_outcome = 'retry' and queued_at <= clock_timestamp() - interval '7 days' then 'queue_expired'
                        when p_outcome = 'sent' then null else p_error_code end,
      lease_token = null, lease_until = null
  where submission_id = p_submission_id and lease_token = p_lease_token
    and status = 'sending' and lease_until > clock_timestamp();
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

revoke all on function public.remember_hours_submission_ids(), public.protect_entry_email_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.save_hours_entry_with_email(jsonb,timestamptz,boolean,text,text),
  public.claim_entry_emails(integer), public.finish_entry_email(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.save_hours_entry_with_email(jsonb,timestamptz,boolean,text,text),
  public.claim_entry_emails(integer), public.finish_entry_email(text,uuid,text,text) to service_role;

commit;
