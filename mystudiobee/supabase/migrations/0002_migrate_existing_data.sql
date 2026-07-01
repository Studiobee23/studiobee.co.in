-- mystudiobee — one-time migration of existing billing.html data into the new schema.
-- Run AFTER 0001_init.sql, and only once you're ready to cut over (see plan's
-- "Migration / Cutover" section). This copies rows from the OLD tables (`clients`,
-- `documents`, `document_series` — used today by billing.html/api/billing.js) into the
-- same-named NEW tables created by 0001_init.sql.
--
-- This assumes the old and new tables briefly coexist with different column sets handled
-- by IF EXISTS checks; if Supabase complains about a naming collision because the old
-- tables already use these exact names, rename the OLD tables first:
--   alter table clients rename to clients_legacy;
--   alter table documents rename to documents_legacy;
--   alter table document_series rename to document_series_legacy;
-- then re-run 0001_init.sql to create the new tables, then run this script against
-- `clients_legacy` / `documents_legacy` / `document_series_legacy`.

insert into clients (id, name, contact_person, email, phone, gstin, address, city, state, created_at, updated_at)
select id, name, contact_person, email, phone, gstin, address, city, state, created_at, created_at
from clients_legacy
on conflict (id) do nothing;

insert into document_series (type, last_number)
select type, last_number from document_series_legacy
on conflict (type) do update set last_number = excluded.last_number;

-- Historical line items predate the costing engine: they keep their original
-- description/rate/amount and get cost_breakdown = null (handled by the app as
-- "no audit trail available for this line item").
insert into documents (
  id, type, number, client_id, status, project_name, category, line_items,
  subtotal, gst_enabled, gst_type, gst_rate, gst_amount, discount, total,
  notes, validity_days, converted_from, created_at, updated_at
)
select
  id, type, number, client_id, status, project_name, category,
  (
    select coalesce(jsonb_agg(item || jsonb_build_object('cost_breakdown', null)), '[]'::jsonb)
    from jsonb_array_elements(line_items) as item
  ),
  subtotal, gst_enabled, gst_type, gst_rate, gst_amount, discount, total,
  notes, validity_days, converted_from, created_at, created_at
from documents_legacy
on conflict (id) do nothing;
