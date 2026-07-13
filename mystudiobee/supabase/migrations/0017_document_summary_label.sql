-- mystudiobee/supabase/migrations/0017_document_summary_label.sql
alter table documents
  add column if not exists summary_label text;
