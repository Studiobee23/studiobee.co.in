-- ============================================================
-- 0027_security_hardening.sql
-- Full security audit remediation:
--   1. Drop leftover USING(true) RLS policies that were silently
--      overriding the correct is_billing_role()-gated policies on
--      delivery_checklists, project_expenses, retainer_months
--      (anon had full table grants on these -> unauthenticated
--      read/write/delete was live in production).
--   2. Split purge_client/purge_expired_bin so the manual RPC path
--      requires owner/admin while the pg_cron path keeps working
--      (it runs as postgres, which never carries auth.uid()).
--   3. Add a role check to increment_doc_series (was callable by
--      anon with no check at all).
--   4. Revoke EXECUTE on all SECURITY DEFINER helper/action
--      functions from anon (and PUBLIC), grant explicitly to the
--      roles that actually need them.
--   5. Pin search_path on the 3 functions that were missing it.
--   6. Revoke anon's blanket table grants across all internal
--      CRM tables (this app has no anon-facing flows; RLS should
--      not be the only line of defense).
--   7. Drop the public listing policy on the client-avatars bucket
--      (public buckets serve by direct URL without it; the policy
--      only enabled enumerating every file in the bucket).
--   8. Default future functions in public to no PUBLIC execute.
-- ============================================================

-- ── 1. Remove policies that bypassed RLS entirely ─────────────
drop policy if exists "billing can manage delivery_checklists" on public.delivery_checklists;
drop policy if exists "billing can manage project_expenses" on public.project_expenses;
drop policy if exists "billing can manage retainer_months" on public.retainer_months;

-- ── 2. purge_client / purge_expired_bin ────────────────────────
-- Private implementation, never directly callable via API.
create or replace function public._purge_client_data(p_client_id uuid)
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
revoke all on function public._purge_client_data(uuid) from public, anon, authenticated;

-- Manual RPC entry point used by the admin "purge now" action.
create or replace function public.purge_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(is_owner_or_admin(), false) then
    raise exception 'insufficient privilege';
  end if;
  perform public._purge_client_data(p_client_id);
end;
$$;
revoke all on function public.purge_client(uuid) from public, anon;
grant execute on function public.purge_client(uuid) to authenticated, service_role;

-- Cron entry point: zero external grants, invoked only by pg_cron as postgres.
create or replace function public.purge_expired_bin()
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
    perform public._purge_client_data(v_client_id);
  end loop;
end;
$$;
revoke all on function public.purge_expired_bin() from public, anon, authenticated;

-- ── 3. increment_doc_series: add missing role check ───────────
create or replace function public.increment_doc_series(series_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val int;
begin
  if not coalesce(is_billing_role(), false) then
    raise exception 'insufficient privilege';
  end if;

  update document_series set last_number = last_number + 1
  where type = series_type
  returning last_number into next_val;
  return next_val;
end;
$$;
revoke all on function public.increment_doc_series(text) from public, anon;
grant execute on function public.increment_doc_series(text) to authenticated, service_role;

-- ── 4. Role-helper functions: tighten grants ───────────────────
revoke all on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated, service_role;

revoke all on function public.is_billing_role() from public, anon;
grant execute on function public.is_billing_role() to authenticated, service_role;

revoke all on function public.is_owner_or_admin() from public, anon;
grant execute on function public.is_owner_or_admin() to authenticated, service_role;

-- ── 5. Pin search_path + tighten grants on remaining functions ─
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.soft_delete_client(p_client_id uuid)
returns void
language plpgsql
set search_path = public
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
revoke all on function public.soft_delete_client(uuid) from public, anon;
grant execute on function public.soft_delete_client(uuid) to authenticated, service_role;

create or replace function public.restore_client(p_client_id uuid)
returns void
language plpgsql
set search_path = public
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
revoke all on function public.restore_client(uuid) from public, anon;
grant execute on function public.restore_client(uuid) to authenticated, service_role;

-- ── 6. Revoke anon's blanket table grants (internal CRM has no anon flows) ─
revoke all on table public.cost_roles from anon;
revoke all on table public.delivery_checklists from anon;
revoke all on table public.equipment from anon;
revoke all on table public.equipment_vendors from anon;
revoke all on table public.external_hires from anon;
revoke all on table public.moms from anon;
revoke all on table public.overhead_items from anon;
revoke all on table public.profiles from anon;
revoke all on table public.profit_split_settings from anon;
revoke all on table public.project_expenses from anon;
revoke all on table public.project_hires from anon;
revoke all on table public.project_stages from anon;
revoke all on table public.project_vendors from anon;
revoke all on table public.projects from anon;
revoke all on table public.retainer_months from anon;
revoke all on table public.service_presets from anon;
revoke all on table public.tasks from anon;
revoke all on table public.time_entries from anon;

-- ── 7. Storage: drop unnecessary avatar-listing policy ─────────
drop policy if exists "Public read client avatars" on storage.objects;

-- ── 8. Close the default-exposure hole for future functions ────
alter default privileges in schema public revoke execute on functions from public;
