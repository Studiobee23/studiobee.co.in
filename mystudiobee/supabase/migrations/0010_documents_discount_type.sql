-- mystudiobee/supabase/migrations/0010_documents_discount_type.sql
alter table documents
  add column if not exists discount_type text not null default 'flat'
    check (discount_type in ('flat', 'percent'));
