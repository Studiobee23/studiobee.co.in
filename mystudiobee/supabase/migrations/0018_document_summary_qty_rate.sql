-- mystudiobee/supabase/migrations/0018_document_summary_qty_rate.sql
alter table documents
  add column if not exists summary_qty double precision,
  add column if not exists summary_rate double precision;
