create extension if not exists pgcrypto;

do $$ begin
  create type employee_role as enum ('worker', 'crew_lead', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entry_status as enum ('approved', 'flagged', 'needs_review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_type as enum ('REG', 'OT', 'DT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type correction_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  role employee_role not null default 'worker',
  active boolean not null default true,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  active boolean not null default true,
  is_favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_aliases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  alias_text text not null,
  created_from_raw_entry_id uuid
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  label_en text not null,
  label_es text not null,
  label_pt text not null,
  active boolean not null default true,
  is_common boolean not null default false,
  sort_order integer not null default 100
);

create table if not exists job_entries (
  id uuid primary key default gen_random_uuid(),
  submitted_by_employee_id uuid not null references employees(id),
  account_id uuid references accounts(id),
  raw_account_text text,
  work_date date not null,
  default_start_time time not null,
  default_finish_time time not null,
  default_calculated_hours numeric(6,2) not null,
  notes text,
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  status entry_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_or_raw check (account_id is not null or raw_account_text is not null)
);

create table if not exists job_entry_services (
  id uuid primary key default gen_random_uuid(),
  job_entry_id uuid not null references job_entries(id) on delete cascade,
  service_id uuid references services(id),
  raw_service_text text,
  constraint service_or_raw check (service_id is not null or raw_service_text is not null)
);

create table if not exists worker_hours (
  id uuid primary key default gen_random_uuid(),
  job_entry_id uuid not null references job_entries(id) on delete cascade,
  employee_id uuid not null references employees(id),
  start_time time not null,
  finish_time time not null,
  calculated_hours numeric(6,2) not null,
  approved_hours numeric(6,2) not null,
  manual_override boolean not null default false,
  override_reason text,
  pay_type_default pay_type not null default 'REG',
  status entry_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pay_splits (
  id uuid primary key default gen_random_uuid(),
  worker_hours_id uuid not null references worker_hours(id) on delete cascade,
  pay_type pay_type not null,
  hours numeric(6,2) not null check (hours >= 0)
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  job_entry_id uuid not null references job_entries(id) on delete cascade,
  uploaded_by_employee_id uuid not null references employees(id),
  file_url text not null,
  file_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists flags (
  id uuid primary key default gen_random_uuid(),
  job_entry_id uuid not null references job_entries(id) on delete cascade,
  worker_hours_id uuid references worker_hours(id) on delete cascade,
  flag_type text not null,
  severity text not null default 'review',
  message text not null,
  resolved boolean not null default false,
  resolved_by uuid references employees(id),
  resolved_at timestamptz
);

create table if not exists correction_requests (
  id uuid primary key default gen_random_uuid(),
  job_entry_id uuid not null references job_entries(id) on delete cascade,
  worker_hours_id uuid references worker_hours(id) on delete cascade,
  requested_by_employee_id uuid not null references employees(id),
  message text not null,
  status correction_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_value_json jsonb,
  new_value_json jsonb,
  actor_id uuid references employees(id),
  actor_role text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists job_entries_work_date_idx on job_entries(work_date);
create index if not exists worker_hours_employee_idx on worker_hours(employee_id);
create index if not exists flags_unresolved_idx on flags(resolved) where resolved = false;

alter table employees enable row level security;
alter table accounts enable row level security;
alter table account_aliases enable row level security;
alter table services enable row level security;
alter table job_entries enable row level security;
alter table job_entry_services enable row level security;
alter table worker_hours enable row level security;
alter table pay_splits enable row level security;
alter table attachments enable row level security;
alter table flags enable row level security;
alter table correction_requests enable row level security;
alter table audit_log enable row level security;
alter table settings enable row level security;

-- MVP note: Next.js route handlers use the service role key for shared app-state persistence.
-- Employee/admin PIN behavior is intentionally unchanged for now.
-- Add stricter JWT/RLS policies once employee sessions are migrated from PIN tokens to Supabase Auth.

insert into services (canonical_key, label_en, label_es, label_pt, active, is_common, sort_order)
values
  ('floor_cleaning', 'Floor cleaning', 'Pisos', 'Pisos', true, true, 10),
  ('strip_wax', 'Strip/wax', 'Strip/wax', 'Strip/wax', true, true, 20),
  ('carpet_shampoo', 'Carpet shampoo', 'Alfombras', 'Carpetes', true, true, 30),
  ('windows_glass', 'Windows/glass', 'Ventanas', 'Vidros', true, true, 40),
  ('bathrooms', 'Bathrooms', 'Banos', 'Banheiros', true, true, 50),
  ('final_construction_cleaning', 'Final construction cleaning', 'Final de obra', 'Final de obra', true, false, 60),
  ('moving_setup', 'Moving/setup', 'Mudanza', 'Mudanca', true, false, 70),
  ('dusting_high_dusting', 'Dusting/high dusting', 'Polvo alto', 'Po alto', true, false, 80),
  ('emergency_cleanup', 'Emergency cleanup', 'Emergencia', 'Emergencia', true, false, 90)
on conflict (canonical_key) do nothing;
