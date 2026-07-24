-- Owner and admin have identical permissions everywhere in the app (every check
-- and RLS policy tests `role in ('owner', 'admin')` together) — the distinction
-- was never enforced anywhere. Collapse them into a single `admin` role.

update profiles set role = 'admin' where role = 'owner';

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'manager', 'employee'));

create or replace function is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_profile_role() = 'admin';
$$;

create or replace function is_billing_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_profile_role() in ('admin', 'manager');
$$;
