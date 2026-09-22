create table if not exists nda_agreements (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id) on delete cascade,
  token                    uuid not null unique default gen_random_uuid(),
  status                   text not null default 'pending' check (status in ('pending','signed','voided')),
  created_by               uuid references profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  expires_at               timestamptz not null default (now() + interval '30 days'),
  sent_at                  timestamptz,
  signed_at                timestamptz,
  signatory_name           text,
  signatory_title          text,
  signatory_email          text,
  client_company_snapshot  text,
  client_address_snapshot  text,
  purpose_snapshot         text,
  signature_type           text check (signature_type in ('typed','drawn')),
  signature_text           text,
  signature_storage_path   text,
  pdf_storage_path         text
);

create index if not exists nda_agreements_client_id_idx on nda_agreements (client_id);
create index if not exists nda_agreements_token_idx on nda_agreements (token);

alter table nda_agreements enable row level security;

create policy "billing roles read nda_agreements" on nda_agreements
  for select using (is_billing_role());

create policy "billing roles write nda_agreements" on nda_agreements
  for insert with check (is_billing_role());

create policy "billing roles update nda_agreements" on nda_agreements
  for update using (is_billing_role());

-- No anon/public policy of any kind — the public /nda/[token] and
-- /api/nda/[token] routes never use the anon key. They authenticate the
-- visitor purely via the unguessable `token` column and always read/write
-- through the service-role admin client (see src/lib/supabase/admin.ts),
-- which bypasses RLS entirely. RLS here exists only to gate the staff UI.

create trigger nda_agreements_set_updated_at before update on nda_agreements
  for each row execute function set_updated_at();

-- The "documents" Storage bucket already exists in production (used by
-- /api/generate-pdf and /api/email-document for quote/invoice PDFs) but has
-- no corresponding migration anywhere in this repo — it was created by hand
-- in the Supabase dashboard at some point. This insert is a defensive no-op
-- against prod (on conflict do nothing) and brings fresh/staging databases
-- up to parity so this feature works there too. Private bucket: PDFs and
-- signature images are sensitive, never public like client-avatars.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- No Storage RLS policies are added for the nda-signatures/ or pdfs/ paths
-- used by this feature. Every write and every signed-URL mint goes through
-- createAdminClient() (service role), which bypasses Storage RLS entirely —
-- the same "no policy, service-role only" pattern already used for
-- clock-in-selfies deletes (see 0030_clock_verification.sql).
