-- Client "Bin": soft-delete a client and everything under it, with a 30-day
-- auto-purge. deleted_at is added to every table that hangs off client_id or
-- project_id so a single `deleted_at is null` filter keeps binned data out of
-- every list/dashboard/report query without needing per-query joins.

alter table clients add column if not exists deleted_at timestamptz;
alter table projects add column if not exists deleted_at timestamptz;
alter table documents add column if not exists deleted_at timestamptz;
alter table tasks add column if not exists deleted_at timestamptz;
alter table time_entries add column if not exists deleted_at timestamptz;
alter table project_stages add column if not exists deleted_at timestamptz;
alter table moms add column if not exists deleted_at timestamptz;
alter table project_expenses add column if not exists deleted_at timestamptz;
alter table delivery_checklists add column if not exists deleted_at timestamptz;
alter table retainer_months add column if not exists deleted_at timestamptz;

create index if not exists clients_deleted_at_idx on clients (deleted_at) where deleted_at is not null;
create index if not exists projects_deleted_at_idx on projects (deleted_at) where deleted_at is not null;

-- Soft-delete a client: stamp deleted_at on the client, its projects, and
-- every row under those projects (or referencing the client directly).
create or replace function soft_delete_client(p_client_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update clients set deleted_at = now() where id = p_client_id and deleted_at is null;

  update projects set deleted_at = now()
    where client_id = p_client_id and deleted_at is null;

  update tasks set deleted_at = now()
    where deleted_at is null and project_id in (select id from projects where client_id = p_client_id);

  update time_entries set deleted_at = now()
    where deleted_at is null and project_id in (select id from projects where client_id = p_client_id);

  update project_stages set deleted_at = now()
    where deleted_at is null and project_id in (select id from projects where client_id = p_client_id);

  update project_expenses set deleted_at = now()
    where deleted_at is null and project_id in (select id from projects where client_id = p_client_id);

  update delivery_checklists set deleted_at = now()
    where deleted_at is null and project_id in (select id from projects where client_id = p_client_id);

  update retainer_months set deleted_at = now()
    where deleted_at is null and project_id in (select id from projects where client_id = p_client_id);

  update moms set deleted_at = now()
    where deleted_at is null
      and (client_id = p_client_id or project_id in (select id from projects where client_id = p_client_id));

  update documents set deleted_at = now()
    where deleted_at is null
      and (client_id = p_client_id or project_id in (select id from projects where client_id = p_client_id));
end;
$$;

-- Restore a client: clear deleted_at on the same set of rows.
create or replace function restore_client(p_client_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update clients set deleted_at = null where id = p_client_id;

  update projects set deleted_at = null where client_id = p_client_id;

  update tasks set deleted_at = null
    where project_id in (select id from projects where client_id = p_client_id);

  update time_entries set deleted_at = null
    where project_id in (select id from projects where client_id = p_client_id);

  update project_stages set deleted_at = null
    where project_id in (select id from projects where client_id = p_client_id);

  update project_expenses set deleted_at = null
    where project_id in (select id from projects where client_id = p_client_id);

  update delivery_checklists set deleted_at = null
    where project_id in (select id from projects where client_id = p_client_id);

  update retainer_months set deleted_at = null
    where project_id in (select id from projects where client_id = p_client_id);

  update moms set deleted_at = null
    where client_id = p_client_id or project_id in (select id from projects where client_id = p_client_id);

  update documents set deleted_at = null
    where client_id = p_client_id or project_id in (select id from projects where client_id = p_client_id);
end;
$$;

-- Hard-purge anything that has sat in the bin for 30+ days. Explicit deletes
-- in dependency order rather than relying on FK cascade behavior, since
-- documents/time_entries currently use ON DELETE SET NULL, not CASCADE.
create or replace function purge_expired_bin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_project_ids uuid[];
begin
  for v_client_id in
    select id from clients where deleted_at is not null and deleted_at < now() - interval '30 days'
  loop
    select coalesce(array_agg(id), '{}') into v_project_ids from projects where client_id = v_client_id;

    delete from documents where client_id = v_client_id or project_id = any(v_project_ids);
    delete from moms where client_id = v_client_id or project_id = any(v_project_ids);
    delete from time_entries where project_id = any(v_project_ids);
    delete from project_stages where project_id = any(v_project_ids);
    delete from project_expenses where project_id = any(v_project_ids);
    delete from delivery_checklists where project_id = any(v_project_ids);
    delete from retainer_months where project_id = any(v_project_ids);
    delete from tasks where project_id = any(v_project_ids);
    delete from projects where client_id = v_client_id;
    delete from clients where id = v_client_id;
  end loop;
end;
$$;

-- Schedule the daily purge via pg_cron.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-expired-bin') then
    perform cron.unschedule('purge-expired-bin');
  end if;
end $$;

select cron.schedule('purge-expired-bin', '0 3 * * *', 'select purge_expired_bin();');
