# Gmail submission copies

New employee submissions accepted by `POST /api/entries` can queue a plain-text
copy from **edu2usa@gmail.com** to **e.oliveira@prefmaint.com**. The addresses are
constants, not client parameters. Telegram still sends after the hours save and
includes the same submission ID. Email is independent and normally follows on
the next ten-minute cron run. No endpoint accepts arbitrary email text or recipients.

## Rollout order

1. Verify the existing `settings` row with `key = 'app_state'` is initialized and
   uses `value_json` (or the supported legacy `value` column). Do not print its
   contents or credentials. New uninitialized installations must first save app
   state through the admin UI.
2. Apply `supabase/migrations/202611070001_entry_email_outbox.sql` in the existing
   Supabase project. It is a transaction and can be rerun. It does not modify
   hours values or send anything. It creates private receipt/outbox tables and
   service-role-only RPCs. Baseline IDs are remembered without creating emails.
3. Keep the existing authorized Google Apps Script deployment and secrets. Set
   server-only production variables `GMAIL_RELAY_URL`, `GMAIL_RELAY_SECRET` and
   `CRON_SECRET`. Both secrets must be at least 32 characters. Do not use a
   `NEXT_PUBLIC_` prefix, copy secrets into source, rotate them casually, or
   disclose their values. The relay URL must have exactly this form:
   `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`.
4. Set `ENTRY_EMAIL_ENABLED=true` for the deployment intended to start capturing
   new submissions. Every other value, including missing, is disabled. Deploy
   the reviewed commit to the existing Vercel Pro project. The existing weekly
   cron remains unchanged; `/api/cron/entry-emails` runs every ten minutes.
5. Verify the deployed commit and schedules without submitting synthetic hours
   or sending test mail. A read-only owner SQL check can inspect counts by
   status. Cron responses contain counts only, never snapshots or credentials.

The migration must precede the new code: entry saves deliberately have no
nontransactional fallback if the RPC is absent. Deploying code with the flag off
continues accepting hours and Telegram but does not queue those submissions for
later email. Enabling it never backfills old hours.

## Durability, identity, and privacy

- The entry append, its ID receipt, and optional email snapshot commit in one
  database transaction under a row lock. Revision conflicts reload/retry the
  existing save flow. A failed queue insert rolls back the hours save.
- `hours_submission_receipts` remembers IDs, including existing and subsequent
  admin-imported IDs, so deleting/restoring an entry cannot send it again. Admin
  edits/imports/restores do not queue mail. Ordinary employee/crew submissions
  in the current UI all use `/api/entries`.
- The immutable snapshot is plain text containing only this submission's ID,
  submitter, workers, site, services, work date, times, hours, flags, override
  reasons, and notes. No GPS, PINs, tokens, unrelated employees, or arbitrary
  JSON fields are projected. It is stored outside public app state. RLS is on,
  client grants/policies are absent, and only the limited RPCs are executable by
  the service role. Snapshot columns cannot be updated.
- Editing/deleting hours cannot mutate a queued copy. Existing admin whole-state
  overwrite semantics remain unchanged; in particular a stale admin save can
  overwrite newer app-state entries, but cannot erase the separate email queue.
- IDs are `hours-entry-v1-` plus SHA-256 of the submission ID. Each relay retry
  uses exactly the same delivery ID, original database queue time, and text.
  Only the request signature timestamp changes.

## Delivery and holds

The cron requires `Authorization: Bearer CRON_SECRET`, fails closed when that
secret is missing, and never accepts a query-string secret. It claims up to five
jobs with `FOR UPDATE SKIP LOCKED`, five-minute leases, and a new lease token.
Only the current lease can record the result. Requests run in parallel with a
20-second timeout, within Vercel's 60-second route budget.

The existing relay accepts an HMAC-SHA256 signature over `timestamp + '.' +
payload`. It maintains its own durable pre-send ledger. A transport failure,
lost response, or expired app lease can safely retry that relay with the same
identity. The app **never retries Gmail directly**. The Google response redirect
is restricted to Google's ContentService host and fetched with GET, without
forwarding the signed body.

Explicit relay `needs_review`, malformed/mismatched receipts, invalid snapshots,
and expiration are held. Retryable outcomes back off from ten minutes to six
hours. The app permits at most **ten total attempts** (nine retries), then holds
the item. A seven-day-old job is never sent, even if the relay prunes old ledger
rows. Oversized snapshots (>100,000 UTF-8 bytes) are held with
`snapshot_too_large` and no message body; the hours still save and Telegram is
still attempted. Such a hold needs review of the original saved entry.

Use authorized owner SQL for aggregate monitoring, for example:

```sql
select status, count(*), min(queued_at) as oldest
from public.entry_email_outbox group by status;
select last_error, count(*) from public.entry_email_outbox
where status = 'needs_review' group by last_error;
```

Do not blindly clear a `needs_review` hold, create a new delivery ID, change the
snapshot, delete receipts, or resend an ambiguous Gmail outcome. First reconcile
the existing relay ledger and Gmail sent state through an authorized workflow.
There is intentionally no public retry/unhold endpoint.

## Pause and rollback

Set `ENTRY_EMAIL_ENABLED=false` and redeploy the same code to stop new capture
and scheduled sends. Already running relay requests may still finish. Keep the
tables, snapshots, and relay dedup ledger intact. Re-enabling resumes pending
jobs within the seven-day window, never submissions received while disabled.
Rolling back to code before this migration stops capturing new copies; leave
the additive migration installed so queued data/receipts are not destroyed.

## Local verification

Use Node 22, matching CI. `npm test` uses Node's test runner, `tsx`, and embedded
PostgreSQL via PGlite. The preload replaces credentials with synthetic values and
blocks fetch until a test supplies an in-memory mock. Do not load production
environment files. Tests cover both settings layouts, repeatable migration,
atomic rollback, revision conflicts, duplicate/import/restore behavior,
immutable snapshots, client permission denial, leases, backoff/limits,
auth/recipient privacy, relay ambiguity, cron persistence, and Telegram
independence. PGlite serializes its local connection; these tests do not claim a
live multi-session PostgreSQL or production provider end-to-end exercise.

Required checks: `npm test`, `npm run typecheck`, `npm run build`. Baseline
`npm run lint` opens Next's interactive setup because this repository has no
ESLint config; do not report that as a lint pass. Do not test by sending real
Gmail/Telegram notifications or by writing production employee records.
