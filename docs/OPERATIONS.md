# Operations

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

Connect Vercel to `https://github.com/Edu2usa/projects-hours` and deploy the default branch.

## Import seed data

Before production, replace demo employee/account data with real Preferred Maintenance lists. Keep employee UI labels translated, but store canonical IDs in the database.
