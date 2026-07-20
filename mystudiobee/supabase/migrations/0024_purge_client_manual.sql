-- Extract the per-client hard-delete logic out of purge_expired_bin() into its
-- own function so it can also be called manually (skip the 30-day wait) from
-- the Bin page's "Delete forever" action.
create or replace function purge_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_project_ids from projects where client_id = p_client_id;

  delete from documents where client_id = p_client_id or project_id = any(v_project_ids);
  delete from moms where client_id = p_client_id or project_id = any(v_project_ids);
  delete from time_entries where project_id = any(v_project_ids);
  delete from project_stages where project_id = any(v_project_ids);
  delete from project_expenses where project_id = any(v_project_ids);
  delete from delivery_checklists where project_id = any(v_project_ids);
  delete from retainer_months where project_id = any(v_project_ids);
  delete from tasks where project_id = any(v_project_ids);
  delete from projects where client_id = p_client_id;
  delete from clients where id = p_client_id;
end;
$$;

create or replace function purge_expired_bin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  for v_client_id in
    select id from clients where deleted_at is not null and deleted_at < now() - interval '30 days'
  loop
    perform purge_client(v_client_id);
  end loop;
end;
$$;
