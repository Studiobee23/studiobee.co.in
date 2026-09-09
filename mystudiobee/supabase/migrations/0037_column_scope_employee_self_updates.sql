-- Security fix: the "employee updates own X" RLS policies on `tasks` and
-- `time_entries` (0012_tasks_employee_access.sql, 0007_time_entries.sql) are
-- whole-row UPDATE policies with no column scoping. The app only ever lets an
-- employee change task `status` (updateTaskStatus in tasks.ts) or clock-out
-- fields (clockOut in time.ts), but nothing at the RLS layer stops an
-- employee from PATCHing any other column on their own row via a direct API
-- call — including `payment_linked`/`payment_amount` on tasks, or rewriting
-- `clocked_in_at`/location/photo/`deleted_at` on their own time entries.
--
-- RLS policies can't restrict individual columns directly, so this adds a
-- BEFORE UPDATE trigger on each table that — only when the caller's profile
-- role is 'employee' — rejects the update if any column outside the allowed
-- set actually changed. Billing/admin roles are untouched (they satisfy the
-- separate "billing roles manage X" policy and this trigger no-ops for them).

create or replace function public.enforce_employee_task_column_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();

  if caller_role = 'employee' then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.project_id is distinct from old.project_id
      or new.assigned_to is distinct from old.assigned_to
      or new.due_date is distinct from old.due_date
      or new.payment_linked is distinct from old.payment_linked
      or new.payment_amount is distinct from old.payment_amount
      or new.created_by is distinct from old.created_by
      or new.deleted_at is distinct from old.deleted_at
    then
      raise exception 'employees may only update task status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_employee_task_column_scope_trigger on tasks;
create trigger enforce_employee_task_column_scope_trigger
  before update on tasks
  for each row
  execute function public.enforce_employee_task_column_scope();

create or replace function public.enforce_employee_time_entry_column_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();

  if caller_role = 'employee' then
    if new.employee_id is distinct from old.employee_id
      or new.project_id is distinct from old.project_id
      or new.notes is distinct from old.notes
      or new.clocked_in_at is distinct from old.clocked_in_at
      or new.clock_in_latitude is distinct from old.clock_in_latitude
      or new.clock_in_longitude is distinct from old.clock_in_longitude
      or new.clock_in_location_label is distinct from old.clock_in_location_label
      or new.clock_in_photo_path is distinct from old.clock_in_photo_path
      or new.deleted_at is distinct from old.deleted_at
    then
      raise exception 'employees may only clock out (not edit clock-in details)';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_employee_time_entry_column_scope_trigger on time_entries;
create trigger enforce_employee_time_entry_column_scope_trigger
  before update on time_entries
  for each row
  execute function public.enforce_employee_time_entry_column_scope();

-- Separate issue, same fix shape: `documents` UPDATE RLS is is_billing_role()
-- (admin OR manager) because managers legitimately need to edit/convert/
-- update-status on documents (documents.ts: updateDocument, updateDocumentStatus,
-- convertDocument, duplicateDocument all use requireBillingRole()). But
-- deleteDocument() specifically requires isAdminTier ("Only admin can delete
-- documents") — a check RLS doesn't back up, so a manager could soft-delete
-- any document by setting deleted_at directly via the API. Block only that
-- column for non-admin-tier callers; leave every other document field
-- updatable by any billing role as intended.
create or replace function public.enforce_admin_only_document_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if new.deleted_at is distinct from old.deleted_at then
    select role into caller_role from profiles where id = auth.uid();
    if caller_role not in ('admin', 'super_admin') then
      raise exception 'only admin can delete or restore documents';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_admin_only_document_delete_trigger on documents;
create trigger enforce_admin_only_document_delete_trigger
  before update on documents
  for each row
  execute function public.enforce_admin_only_document_delete();
