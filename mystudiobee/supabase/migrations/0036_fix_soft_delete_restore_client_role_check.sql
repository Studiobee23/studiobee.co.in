-- Security fix: soft_delete_client() and restore_client() had no internal role
-- check, unlike their sibling purge_client()/increment_doc_series() in
-- 0027_security_hardening.sql. Both are granted EXECUTE to `authenticated`,
-- and the `clients` table's UPDATE policy is is_billing_role() (admin OR
-- manager) — so any manager-tier user could call these RPCs directly via the
-- browser console and cascade-soft-delete/restore any client, bypassing the
-- app's admin-only intent (clients.ts: requireAdminTier(), "Only admin can
-- delete or restore clients").

create or replace function public.soft_delete_client(p_client_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(is_owner_or_admin(), false) then
    raise exception 'insufficient privilege';
  end if;

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
revoke all on function public.soft_delete_client(uuid) from public, anon;
grant execute on function public.soft_delete_client(uuid) to authenticated, service_role;

create or replace function public.restore_client(p_client_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(is_owner_or_admin(), false) then
    raise exception 'insufficient privilege';
  end if;

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
revoke all on function public.restore_client(uuid) from public, anon;
grant execute on function public.restore_client(uuid) to authenticated, service_role;
