-- ============================================================
-- 0026_vendors_and_hires.sql
-- Equipment rental vendors + external hires, rated & linked to projects
-- ============================================================

-- ── EQUIPMENT VENDORS ─────────────────────────────────────────
create table if not exists equipment_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text default '',
  phone text default '',
  email text default '',
  notes text default '',
  rating_equipment_quality smallint check (rating_equipment_quality between 1 and 5),
  rating_price smallint check (rating_price between 1 and 5),
  rating_vendor_quality smallint check (rating_vendor_quality between 1 and 5),
  overall_rating numeric(3,1) generated always as (
    round((coalesce(rating_equipment_quality, 0) + coalesce(rating_price, 0) + coalesce(rating_vendor_quality, 0))::numeric / 3.0, 1)
  ) stored,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table equipment_vendors enable row level security;
drop policy if exists "owner/admin manage equipment_vendors" on equipment_vendors;
create policy "owner/admin manage equipment_vendors" on equipment_vendors
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

-- ── EXTERNAL HIRES ─────────────────────────────────────────────
create table if not exists external_hires (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text default '',
  phone text default '',
  email text default '',
  notes text default '',
  rating_skill_quality smallint check (rating_skill_quality between 1 and 5),
  rating_reliability smallint check (rating_reliability between 1 and 5),
  rating_professionalism smallint check (rating_professionalism between 1 and 5),
  rating_price smallint check (rating_price between 1 and 5),
  overall_rating numeric(3,1) generated always as (
    round((coalesce(rating_skill_quality, 0) + coalesce(rating_reliability, 0) + coalesce(rating_professionalism, 0) + coalesce(rating_price, 0))::numeric / 4.0, 1)
  ) stored,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table external_hires enable row level security;
drop policy if exists "owner/admin manage external_hires" on external_hires;
create policy "owner/admin manage external_hires" on external_hires
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

-- ── PROJECT ↔ VENDOR LINK ────────────────────────────────────
create table if not exists project_vendors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vendor_id uuid not null references equipment_vendors(id) on delete cascade,
  notes text default '',
  created_at timestamptz default now(),
  unique (project_id, vendor_id)
);
alter table project_vendors enable row level security;
drop policy if exists "owner/admin manage project_vendors" on project_vendors;
create policy "owner/admin manage project_vendors" on project_vendors
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

-- ── PROJECT ↔ HIRE LINK ──────────────────────────────────────
create table if not exists project_hires (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  hire_id uuid not null references external_hires(id) on delete cascade,
  role_on_shoot text default '',
  notes text default '',
  created_at timestamptz default now(),
  unique (project_id, hire_id)
);
alter table project_hires enable row level security;
drop policy if exists "owner/admin manage project_hires" on project_hires;
create policy "owner/admin manage project_hires" on project_hires
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());
