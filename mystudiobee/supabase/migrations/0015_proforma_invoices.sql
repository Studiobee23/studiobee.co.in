-- Adds "proforma" as a document type, slotting into the billing pipeline as
-- quote -> proforma -> invoice -> receipt (see NEXT_TYPE in src/lib/actions/documents.ts).

alter table documents drop constraint if exists documents_type_check;
alter table documents add constraint documents_type_check
  check (type in ('quote', 'proforma', 'invoice', 'receipt'));

insert into document_series (type, last_number) values ('proforma', 0)
on conflict (type) do nothing;
