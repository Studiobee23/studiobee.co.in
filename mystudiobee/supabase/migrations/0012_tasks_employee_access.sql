-- mystudiobee/supabase/migrations/0012_tasks_employee_access.sql
-- The only RLS policy on `tasks` was "billing roles manage tasks" (owner/admin/
-- manager only) — employees had zero database access to the table, so even a
-- correctly-assigned task was invisible to the person it was assigned to, and
-- they couldn't update its status either. Add policies scoped to their own
-- assigned tasks (additive/permissive — the existing billing-role policy is
-- untouched).
create policy "employee sees own assigned tasks" on tasks
  for select using (assigned_to = auth.uid());

create policy "employee updates own assigned tasks" on tasks
  for update using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- Same class of bug on `projects`: only billing roles (owner/admin/manager) could
-- read the table at all, so an employee's Clock In project dropdown and their
-- grouped Tasks view both silently showed no project data (RLS denial returns
-- empty rows, not an error — nothing looked broken, it just showed nothing).
-- Project names/status aren't sensitive; this is read-only, writes still gated.
-- Scoped to active profiles as defense-in-depth (proxy.ts middleware already
-- blocks deactivated users from reaching any page, but belt-and-suspenders).
create policy "active users read projects" on projects
  for select using (
    exists (select 1 from profiles where id = auth.uid() and active)
  );

-- tasks/page.tsx previously used the service-role admin client to fetch the
-- team list for the assignee picker, bypassing RLS entirely to work around
-- profiles' owner/admin-only read policy — a bypass pattern that's easy to
-- extend into something actually sensitive later. Add a scoped policy instead
-- so it can use the regular RLS-respecting client like everywhere else.
create policy "active users read active profiles for assignment" on profiles
  for select using (
    active and exists (select 1 from profiles p where p.id = auth.uid() and p.active)
  );
