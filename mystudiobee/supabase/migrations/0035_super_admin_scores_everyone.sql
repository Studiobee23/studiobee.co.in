-- Super_admin should be able to log/edit/delete points for anyone below them
-- (admin, manager, employee), not just employees — but a plain admin/manager must
-- still be restricted to employee targets only. The "admin tier ... any point_events"
-- policies previously let any admin-tier caller act on ANY target regardless of role;
-- narrow them so a non-super-admin admin-tier caller is confined to employee targets.

drop policy if exists "admin tier inserts any point_events" on point_events;
create policy "admin tier inserts any point_events" on point_events
  for insert with check (
    is_owner_or_admin()
    and (
      is_super_admin()
      or exists (select 1 from profiles e where e.id = employee_id and e.role = 'employee')
    )
  );

drop policy if exists "admin tier updates any point_events" on point_events;
create policy "admin tier updates any point_events" on point_events
  for update
  using (
    is_owner_or_admin()
    and (
      is_super_admin()
      or exists (select 1 from profiles e where e.id = point_events.employee_id and e.role = 'employee')
    )
  )
  with check (
    is_owner_or_admin()
    and (
      is_super_admin()
      or exists (select 1 from profiles e where e.id = employee_id and e.role = 'employee')
    )
  );

drop policy if exists "admin tier deletes any point_events" on point_events;
create policy "admin tier deletes any point_events" on point_events
  for delete using (
    is_owner_or_admin()
    and (
      is_super_admin()
      or exists (select 1 from profiles e where e.id = point_events.employee_id and e.role = 'employee')
    )
  );
