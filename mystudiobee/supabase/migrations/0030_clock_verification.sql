-- Clock-in verification: selfie + location at both punches.
-- Renames the clock-in-only location columns now, before clock_out_*
-- siblings exist, so the naming doesn't stay confusing forever.
alter table time_entries rename column latitude to clock_in_latitude;
alter table time_entries rename column longitude to clock_in_longitude;
alter table time_entries rename column location_label to clock_in_location_label;

alter table time_entries
  add column if not exists clock_out_latitude double precision,
  add column if not exists clock_out_longitude double precision,
  add column if not exists clock_out_location_label text,
  add column if not exists clock_in_photo_path text;

-- Private bucket: employee selfies, not public marketing assets like client-avatars.
insert into storage.buckets (id, name, public)
values ('clock-in-selfies', 'clock-in-selfies', false)
on conflict (id) do nothing;

create policy "employee inserts own clock photo"
on storage.objects for insert
with check (
  bucket_id = 'clock-in-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "employee reads own clock photo"
on storage.objects for select
using (
  bucket_id = 'clock-in-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "billing role reads all clock photos"
on storage.objects for select
using (
  bucket_id = 'clock-in-selfies'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);

-- No delete policy for any authenticated role — the photo-purge cron uses the
-- service-role client (createAdminClient), which bypasses RLS entirely.

-- Extend the existing bin purge to also hard-delete time entries that were
-- soft-deleted directly (not via a client cascade) once they're 30+ days old.
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
  delete from time_entries
    where deleted_at is not null and deleted_at < now() - interval '30 days';

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
