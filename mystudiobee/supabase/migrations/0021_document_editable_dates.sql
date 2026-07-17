-- mystudiobee/supabase/migrations/0021_document_editable_dates.sql
-- Lets staff directly edit the document date and quote valid-until date instead
-- of only deriving them from created_at/validity_days. Both nullable: existing
-- rows fall back to the old computed values in the PDF template (see template.ts).
alter table documents
  add column if not exists doc_date date,
  add column if not exists valid_until date;
