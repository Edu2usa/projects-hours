# Notification-only delivery test

This is a private operational test, not a payroll submission. It calls the same
`deliverEntryEmail` Gmail relay and `sendTelegramMessage` transport used by the
app. The body begins `TEST ONLY`, includes its stable TEST ID and zero payroll
hours, and contains no employee data. The existing relay controls the email
subject; the synthetic ID and body distinguish the test. Sender and recipient
remain `edu2usa@gmail.com` and `e.oliveira@prefmaint.com`. Telegram uses only the
existing entry-alert destinations, deduplicating identical configured IDs.

## Safety and limits

- Nothing is queued by migration, deployment, page load, or an ordinary request.
  Only an authorized database owner can deliberately insert the test request.
  There is no new public endpoint, app login, credential, or arbitrary-message API.
- The existing `/api/cron/entry-emails` route still requires `CRON_SECRET` and
  `ENTRY_EMAIL_ENABLED=true`. It processes at most two pending channel rows per
  run, in parallel with normal email deliveries. Normal email retry handling,
  real submission receipts/outbox, app state, and payroll reports are unchanged.
- Each channel transitions atomically from `pending` to `sending` before its
  external call. A sending row is NEVER reclaimed. Transport uncertainty,
  partial Telegram success, invalid receipts, and all retryable test outcomes
  are held for review, without automatic resends. Gmail retains its existing
  relay dedup identity. Telegram provides no idempotency guarantee.
- A worker that crashes leaves an attempted/possibly attempted channel visible
  as `sending`; a subsequent cron marks it `needs_review` after five minutes.
  Pending requests expire after one day. Provider calls have 20-second timeouts.
- Each channel result is recorded independently. Gmail stores the relay receipt
  and provider ID; Telegram stores only configured destination IDs, HTTP status,
  acceptance and message IDs, or fixed error codes. Results are private. The
  route returns aggregate counts, not test IDs, messages, destinations, or tokens.
  Test-only database failures return a sanitized unavailable marker without
  interrupting normal mail. Both paths and both test channels settle before return.
- `sent` means provider acceptance, NOT proven arrival/read in the recipient's
  mailbox or Telegram app. Verify actual arrival separately through authorized
  read-only access or ask the recipient. This does not test submission saving.

## Coordinated rollout (no test send)

1. Finish review and required local checks. Coordinate approval for the exact
   additive migration before applying production SQL.
2. Apply `supabase/migrations/202611070002_notification_tests.sql` to the existing
   Supabase project. It adds only `notification_test_deliveries`, its immutable
   identity trigger and two service-role-only claim/result RPCs. RLS is enabled;
   public, anon, authenticated and service_role have no direct table grants.
   No payroll table, existing outbox function, or existing data is modified.
3. Verify the ledger is empty and anonymous/authenticated RPC access is denied.
4. Publish the reviewed code only after coordination. Verify the exact deployed
   commit and existing cron schedule; no new variables or secret changes needed.
5. Confirm production readiness and permission for ONE test before the next step.

## Queue exactly one approved test

Using the already-authorized owner's Supabase SQL editor, choose one unique
`notification-test-v1-UUID` (lowercase UUID) and retain it for all checks. Replace
`APPROVED_TEST_ID` below with that exact ID. This transaction intentionally
initiates the test on the next authenticated ten-minute cron run. It may run
immediately if the scheduled cron overlaps. No secret is typed, copied, logged,
or exposed. Do not queue until both production setup and sending are approved.

```sql
begin;
insert into public.notification_test_deliveries(test_id, channel)
values ('APPROVED_TEST_ID', 'gmail'), ('APPROVED_TEST_ID', 'telegram')
on conflict (test_id, channel) do nothing;
commit;
```

The two rows are one test, with independently recorded channel results. Rerunning
with that same ID does not repeat an attempt. Never change the ID to retry an
uncertain outcome. Do not manually invoke with an extracted secret; allow the
existing authenticated Vercel cron, or its supported authenticated dashboard Run
control if available, to consume the deliberately queued test.

## Read-only verification

Capture the latest real-entry count, unique-entry count, receipt count, outbox
count/status and total approved hours before queuing. Do not print employee
records. The initial rollout's historical baseline was 117 entries and receipts,
with an empty outbox; it may legitimately change with real employee activity.
Compare current aggregates and verify this test ID never appears in real data:

```sql
select test_id, channel, queued_at, status, claimed_at, finished_at, result
from public.notification_test_deliveries where test_id = 'APPROVED_TEST_ID';

select count(*) as test_receipts from public.hours_submission_receipts
where submission_id = 'APPROVED_TEST_ID';
select count(*) as test_outbox_rows from public.entry_email_outbox
where submission_id = 'APPROVED_TEST_ID';
select count(*) as test_entries
from public.settings s,
  lateral jsonb_array_elements(coalesce(to_jsonb(s)->'value_json', to_jsonb(s)->'value')->'entries') e
where s.key = 'app_state' and e->>'id' = 'APPROVED_TEST_ID';
```

All three real-data test counts must stay zero. Retain the test ledger and relay
ledger. Do not delete test rows, reset statuses, alter timestamps, or resend when
any outcome is uncertain. Reconcile provider state first. Rollback is a code
rollback; keep the additive ledger for audit and duplicate safety. An owner can
hold an explicitly cancelled, still-pending test with `status='needs_review'`
and a fixed cancellation result, but must not reset sending/sent rows.

## Local verification

`npm test`, `npm run typecheck`, and `npm run build` are required. Tests use the
existing synthetic-credential/network-blocking preload, mock HTTP, and PGlite.
They cover owner-only queuing, inert migration/repeated cron, immutability,
claim-once behavior, crash holds, fixed content/destinations, per-channel receipts,
provider uncertainty, result-write failure, and unchanged normal email/entry paths.
PGlite does not prove live multi-session PostgreSQL behavior. Lint remains the
repository's pre-existing interactive setup blocker; no unrelated config added.
