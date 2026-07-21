-- Client profile images: nullable avatar_url on clients, a public Storage
-- bucket to hold the files, and RLS restricting writes to billing-role
-- users (owner/admin/manager) — matches the requireBillingRole() check
-- already enforced by upsertClient/updateClientAvatar server actions.
-- Public read is fine: these are just client photos/logos, not sensitive.
alter table clients add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('client-avatars', 'client-avatars', true)
on conflict (id) do nothing;

create policy "Public read client avatars"
on storage.objects for select
using (bucket_id = 'client-avatars');

create policy "Billing role insert client avatars"
on storage.objects for insert
with check (
  bucket_id = 'client-avatars'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);

create policy "Billing role update client avatars"
on storage.objects for update
using (
  bucket_id = 'client-avatars'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);

create policy "Billing role delete client avatars"
on storage.objects for delete
using (
  bucket_id = 'client-avatars'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);
