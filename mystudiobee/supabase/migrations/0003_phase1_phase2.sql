-- ============================================================
-- 0003_phase1_phase2.sql
-- Phase 1: Profit share | Phase 2: Projects, Tasks, Equipment, MOMs
-- ============================================================

-- ── PROFIT SHARE SETTINGS ────────────────────────────────────
create table if not exists profit_split_settings (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  floor numeric(12,2) not null default 0,
  threshold numeric(12,2) not null default 0,
  tiers jsonb not null default '[]',
  created_at timestamptz default now()
);
alter table profit_split_settings enable row level security;
create policy "owner/admin manage profit_split_settings" on profit_split_settings
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

insert into profit_split_settings (category, floor, threshold, tiers) values
('video', 0, 50000, '[{"max":50000,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12},{"max":null,"mode":"cost-plus","company_pct":57,"executor_pct":31,"manager_pct":12}]'),
('web', 0, 50000, '[{"max":50000,"mode":"simple","company_pct":50,"executor_pct":30,"origination_pct":10,"client_handling_pct":10},{"max":null,"mode":"cost-plus","company_pct":50,"executor_pct":30,"origination_pct":10,"client_handling_pct":10}]'),
('design', 0, 50000, '[{"max":50000,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12},{"max":null,"mode":"cost-plus","company_pct":57,"executor_pct":31,"manager_pct":12}]'),
('retainer', 0, 0, '[{"max":null,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12}]')
on conflict (category) do nothing;

-- ── ALTER DOCUMENTS (profit share + project link) ─────────────
alter table documents
  add column if not exists executor_id uuid references profiles(id) on delete set null,
  add column if not exists manager_id uuid references profiles(id) on delete set null,
  add column if not exists client_handler_id uuid references profiles(id) on delete set null,
  add column if not exists profit_split jsonb,
  add column if not exists project_id uuid;

-- ── PROJECTS ──────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  description text default '',
  category text default '',
  type text not null default 'project' check (type in ('project','retainer')),
  status text not null default 'active' check (status in ('active','on_hold','completed','cancelled')),
  est_hours numeric(8,2) default 0,
  start_date date,
  end_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table projects enable row level security;
create policy "billing roles manage projects" on projects
  for all using (is_billing_role()) with check (is_billing_role());

-- Now add the FK from documents to projects
alter table documents
  add constraint documents_project_id_fkey
  foreign key (project_id) references projects(id) on delete set null;

-- ── PROJECT LIFECYCLE STAGES ──────────────────────────────────
create table if not exists project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage text not null check (stage in (
    'needs_analysis','quote','quote_revision','quote_approved',
    'proforma_sent','advance_received','in_progress',
    'second_payment','delivery_checklist','completed'
  )),
  completed_at timestamptz,
  notes text default '',
  created_at timestamptz default now(),
  unique (project_id, stage)
);
alter table project_stages enable row level security;
create policy "billing roles manage project_stages" on project_stages
  for all using (is_billing_role()) with check (is_billing_role());

-- ── TASKS ─────────────────────────────────────────────────────
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text default '',
  status text not null default 'pending' check (status in ('pending','in_progress','delayed','completed')),
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  payment_linked boolean not null default false,
  payment_amount numeric(12,2),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table tasks enable row level security;
create policy "billing roles manage tasks" on tasks
  for all using (is_billing_role()) with check (is_billing_role());

-- ── EQUIPMENT INVENTORY ───────────────────────────────────────
create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  purchase_date date,
  purchase_cost numeric(12,2),
  gst_amount numeric(12,2),
  receipt_url text,
  daily_rental_cost numeric(12,2) default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table equipment enable row level security;
create policy "owner/admin manage equipment" on equipment
  for all using (is_owner_or_admin()) with check (is_owner_or_admin());

-- ── MINUTES OF MEETING ────────────────────────────────────────
create table if not exists moms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  content text default '',
  attendees text[] default '{}',
  meeting_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table moms enable row level security;
create policy "billing roles manage moms" on moms
  for all using (is_billing_role()) with check (is_billing_role());
