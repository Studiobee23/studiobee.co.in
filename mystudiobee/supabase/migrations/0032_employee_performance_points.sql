-- Employee performance points + super_admin role
-- See docs/superpowers/specs/2026-07-24-employee-performance-points-design.md

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'employee'));

alter table profiles add column if not exists manager_id uuid references profiles(id) on delete set null;

-- arora.nikhil is the first super_admin; the other 2 existing profiles stay admin.
update profiles set role = 'super_admin' where email = 'arora.nikhil@studiobee.co.in';

-- Name kept from the pre-merge role model (referenced by ~15 existing policies by
-- name) — now means "admin or above".
create or replace function is_owner_or_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select current_profile_role() in ('admin', 'super_admin');
$$;

create or replace function is_billing_role()
returns boolean
language sql stable security definer set search_path = public
as $$
  select current_profile_role() in ('admin', 'super_admin', 'manager');
$$;

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select current_profile_role() = 'super_admin';
$$;

-- Narrow profit_split_settings to super_admin at the DB layer (was admin-only).
drop policy if exists "owner/admin manage profit_split_settings" on profit_split_settings;
create policy "super_admin manages profit_split_settings" on profit_split_settings
  for all using (is_super_admin()) with check (is_super_admin());

create table point_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  points integer not null,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table point_reasons enable row level security;

create policy "any active profile reads point_reasons" on point_reasons
  for select using (exists (select 1 from profiles where id = auth.uid() and active));
create policy "super_admin manages point_reasons" on point_reasons
  for all using (is_super_admin()) with check (is_super_admin());

create table point_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  reason_id uuid not null references point_reasons(id) on delete restrict,
  points integer not null,
  note text not null default '',
  logged_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table point_events enable row level security;

create policy "employees read own point_events" on point_events
  for select using (employee_id = auth.uid());
create policy "billing roles read all point_events" on point_events
  for select using (is_billing_role());

create policy "admin tier inserts any point_events" on point_events
  for insert with check (is_owner_or_admin());
create policy "manager inserts point_events for own reports" on point_events
  for insert with check (
    current_profile_role() = 'manager'
    and exists (select 1 from profiles e where e.id = employee_id and e.manager_id = auth.uid())
  );

create policy "admin tier updates any point_events" on point_events
  for update using (is_owner_or_admin());
create policy "logger updates own point_events" on point_events
  for update using (logged_by = auth.uid());

create policy "admin tier deletes any point_events" on point_events
  for delete using (is_owner_or_admin());
create policy "logger deletes own point_events" on point_events
  for delete using (logged_by = auth.uid());
