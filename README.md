# Special Project Hours

Mobile-first PWA for Preferred Maintenance special-project hours. It replaces Google Forms with clean employee PIN login, account/service pickers, crew submissions, admin cleanup, payroll review, and Excel/PDF exports.

## Stack

- Next.js / React
- Supabase Postgres and Storage
- Vercel hosting
- PWA offline draft support

## Local setup

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`, then run the SQL in `supabase/schema.sql` in your Supabase project.

## First deploy

1. Create a Supabase project.
2. Run `supabase/schema.sql`.
3. Create a `job-attachments` storage bucket.
4. Add the Vercel env vars from `.env.example`.
5. Deploy to Vercel from this GitHub repo.

The app includes seed services and demo UI data. Replace or import the real employee/account/service lists before production use.
