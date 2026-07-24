-- Security review caught that any admin-tier caller could update ANY profile row
-- via the regular (RLS-respecting) client used by updateEmployeeRole/setEmployeeActive
-- in team.ts — including granting super_admin to someone, or demoting/deactivating an
-- existing super_admin. The app-layer guard added in team.ts closes this for the app's
-- own UI, but the RLS policy itself was still permissive to any admin-tier caller
-- hitting Supabase directly. Narrow it so only super_admin can touch a row that
-- currently is (or would become) super_admin.

drop policy if exists "owner/admin update all profiles" on profiles;
create policy "owner/admin update all profiles" on profiles
  for update
  using (is_owner_or_admin() and (role <> 'super_admin' or is_super_admin()))
  with check (is_owner_or_admin() and (role <> 'super_admin' or is_super_admin()));

drop policy if exists "owner/admin write all profiles" on profiles;
create policy "owner/admin write all profiles" on profiles
  for insert
  with check (is_owner_or_admin() and (role <> 'super_admin' or is_super_admin()));
