-- mystudiobee/supabase/migrations/0020_document_scope_of_work.sql
-- Adds an editable "Scope of Work" page to quote/proforma PDFs: an ordered list of
-- custom {heading, body} sections, rendered between Notes and Terms & Conditions.
alter table documents
  add column if not exists scope_of_work jsonb not null default '[]';
