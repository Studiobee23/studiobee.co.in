-- mystudiobee — Phase 1 schema (Auth + Roles + CRM + Quotes/Estimates/Costing)
-- Run this in the Supabase SQL Editor of the same project used by the studiobee.co.in site.
-- This creates a NEW set of tables; it does not touch the existing `clients`/`documents`/
-- `document_series` tables used by billing.html. Those are migrated separately (see
-- supabase/migrations/0002_migrate_existing_data.sql) once this schema is verified.

-- ───────────────────────────────────────────────────────────────────────────
-- profiles — 1:1 with auth.users, holds role + display info
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text default '',
  role text not null default 'employee' check (role in ('owner', 'admin', 'manager', 'employee')),
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Helper: current user's role, used throughout RLS policies below.
-- security definer + stable so it can be called freely inside policies without recursion issues.
create or replace function current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_profile_role() in ('owner', 'admin');
$$;

create or replace function is_billing_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_profile_role() in ('owner', 'admin', 'manager');
$$;

alter table profiles enable row level security;

create policy "read own profile" on profiles
  for select using (id = auth.uid());

create policy "owner/admin read all profiles" on profiles
  for select using (is_owner_or_admin());

create policy "owner/admin write all profiles" on profiles
  for insert with check (is_owner_or_admin());

create policy "owner/admin update all profiles" on profiles
  for update using (is_owner_or_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- clients — CRM
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text default '',
  email text default '',
  phone text default '',
  gstin text default '',
  address text default '',
  city text default '',
  state text default '',
  notes text default '',
  tags text[] default '{}',
  lead_source text default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table clients enable row level security;

create policy "billing roles read clients" on clients
  for select using (is_billing_role());

create policy "billing roles write clients" on clients
  for insert with check (is_billing_role());

create policy "billing roles update clients" on clients
  for update using (is_billing_role());

-- ───────────────────────────────────────────────────────────────────────────
-- cost model — owner/admin only (managers never read these tables directly;
-- they get computed prices through a server action instead)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists cost_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists overhead_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost numeric(12,2) not null default 0,
  type text not null default 'per-project' check (type in ('per-project', 'monthly')),
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists service_presets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  preset_hours jsonb not null default '{}',        -- { "<cost_role_id>": hours }
  default_overhead_ids uuid[] not null default '{}',
  default_markup_pct numeric(5,2) not null default 0,
  created_at timestamptz default now()
);

alter table cost_roles enable row level security;
alter table overhead_items enable row level security;
alter table service_presets enable row level security;

create policy "owner/admin manage cost_roles" on cost_roles
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

create policy "owner/admin manage overhead_items" on overhead_items
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

-- managers need to READ presets (name/category/hours/overheads/markup) so the UI can
-- list "which preset do you want to start from" — but the rate/cost values they pull in
-- are resolved server-side via a service-role action, never sent raw to a manager session
-- for cost_roles/overhead_items. service_presets itself contains no currency values, so it's
-- safe for managers to read directly.
create policy "owner/admin manage service_presets" on service_presets
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

create policy "billing roles read service_presets" on service_presets
  for select using (is_billing_role());

-- ───────────────────────────────────────────────────────────────────────────
-- documents — quotes / invoices / receipts (conversion chain via converted_from)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists document_series (
  type text primary key,
  last_number int not null default 0
);
insert into document_series (type, last_number) values
  ('quote', 0), ('invoice', 0), ('receipt', 0)
on conflict (type) do nothing;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('quote', 'invoice', 'receipt')),
  number text not null,
  client_id uuid references clients(id) on delete set null,
  status text not null default 'draft',
  project_name text default '',
  category text default '',
  line_items jsonb not null default '[]',   -- see cost_breakdown shape in spec
  subtotal numeric(12,2) default 0,
  gst_enabled boolean default true,
  gst_type text default 'cgst_sgst',
  gst_rate numeric(5,2) default 18,
  gst_amount numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text default '',
  validity_days int default 15,
  converted_from uuid references documents(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table document_series enable row level security;
alter table documents enable row level security;

create policy "billing roles read document_series" on document_series
  for select using (is_billing_role());
create policy "billing roles update document_series" on document_series
  for update using (is_billing_role());

create policy "billing roles read documents" on documents
  for select using (is_billing_role());
create policy "billing roles write documents" on documents
  for insert with check (is_billing_role());
create policy "billing roles update documents" on documents
  for update using (is_billing_role());

-- Atomic auto-numbering — avoids a race between two quotes grabbing the same number.
create or replace function increment_doc_series(series_type text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val int;
begin
  update document_series set last_number = last_number + 1
  where type = series_type
  returning last_number into next_val;
  return next_val;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- keep updated_at fresh
-- ───────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at before update on clients
  for each row execute function set_updated_at();
create trigger documents_set_updated_at before update on documents
  for each row execute function set_updated_at();
