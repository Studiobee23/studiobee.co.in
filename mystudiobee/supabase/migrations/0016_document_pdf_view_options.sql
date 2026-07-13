-- mystudiobee/supabase/migrations/0016_document_pdf_view_options.sql
alter table documents
  add column if not exists hide_pricing boolean not null default false,
  add column if not exists summary_view boolean not null default false;
