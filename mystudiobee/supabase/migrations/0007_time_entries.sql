-- mystudiobee/supabase/migrations/0007_time_entries.sql
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

alter table time_entries enable row level security;

-- Employees can only see/insert/update their own rows
create policy "employee sees own entries" on time_entries
  for select using (employee_id = auth.uid());

create policy "employee inserts own entries" on time_entries
  for insert with check (employee_id = auth.uid());

create policy "employee updates own entries" on time_entries
  for update using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- Billing roles (owner/admin/manager) can see all entries
create policy "billing sees all entries" on time_entries
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('owner', 'admin', 'manager')
    )
  );

-- Owner/admin can delete any entry (for corrections)
create policy "owner admin delete entries" on time_entries
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create index time_entries_employee_idx on time_entries (employee_id);
create index time_entries_clocked_in_idx on time_entries (clocked_in_at desc);
