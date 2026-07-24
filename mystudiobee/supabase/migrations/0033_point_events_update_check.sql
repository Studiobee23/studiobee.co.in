-- The "logger updates own point_events" policy (0032) had a USING clause but no
-- WITH CHECK, so a manager could update their own logged row's employee_id to
-- reassign it to an employee outside their reports (bypassing the INSERT-time
-- manager-scope check). Admins are unaffected — they're covered by the separate
-- "admin tier updates any point_events" policy.
drop policy if exists "logger updates own point_events" on point_events;
create policy "logger updates own point_events" on point_events
  for update using (logged_by = auth.uid())
  with check (
    logged_by = auth.uid()
    and exists (select 1 from profiles e where e.id = employee_id and e.manager_id = auth.uid())
  );
