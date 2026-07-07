# Operations

## Payroll periods

Payroll runs biweekly: 14-day periods ending every other Friday, anchored at the period that closed with week 1 ending 6/26/2026 and week 2 ending 7/3/2026 (`anchorPeriodEnd` in `lib/payroll.ts`). Hours are assigned to a payroll by their **work date** — anything dated 7/4/2026 or later belongs to the 7/4-7/17 payroll, and so on.

All exports accept a `?period=` query parameter:

- `current` (default) - the payroll period containing today (America/New_York)
- `previous` - the most recently closed payroll
- `all` - full history, no filter
- any `YYYY-MM-DD` date - the payroll period containing that date

The Excel export includes a "Payroll Period" cover sheet plus Week 1/Week 2 hour columns in the payroll summary. The Monday Telegram report covers the payroll period containing the most recent Friday: right after a close it reports the finished payroll (marked CLOSED - ready for payroll); mid-period it reports week 1 progress.

## Supabase

Run `supabase/schema.sql` in the SQL editor for the project. Then create a private storage bucket named `job-attachments`.

PINs must be stored in `employees.pin_hash`, never as plain text. The intended production path is:

1. Admin creates employees with temporary PINs.
2. Server route hashes the PIN with `pgcrypto` or a Node password hashing library.
3. Employee login compares against the hash and returns an app session token.

## Vercel

Set these environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PIN_HASH`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_ID`
- `TELEGRAM_ENTRY_CHAT_IDS` optional comma-separated chat IDs for every new entry alert. Falls back to `TELEGRAM_ADMIN_CHAT_ID`.
- `TELEGRAM_REPORT_CHAT_IDS` optional comma-separated chat IDs for weekly reports. Use this for a Telegram group/channel that includes Hermes. Falls back to `TELEGRAM_HERMES_CHAT_ID`, then `TELEGRAM_ADMIN_CHAT_ID`.
- `TELEGRAM_HERMES_CHAT_ID` optional report recipient when Hermes receives Telegram messages from a group/channel.
- `CRON_SECRET` optional secret for manually triggering `/api/cron/weekly-report`.
- `APP_BASE_URL` set to `https://projects-hours.vercel.app` for report links.

Connect Vercel to `https://github.com/Edu2usa/projects-hours` and deploy the default branch.

## Telegram

The server sends a Telegram alert after `/api/entries` accepts a new hours entry. The weekly report is scheduled in `vercel.json` for Monday 8:00 AM Eastern during daylight saving time (`0 12 * * 1` UTC).

For Hermes reports, add the Telegram bot and Hermes agent to the same Telegram group or channel, then set that group/channel ID in `TELEGRAM_REPORT_CHAT_IDS`. Telegram bots generally cannot direct-message other bots.

## Import seed data

Before production, replace demo employee/account data with real Preferred Maintenance lists. Keep employee UI labels translated, but store canonical IDs in the database.
