-- mystudiobee/supabase/migrations/0019_document_line_item_view.sql
-- Replaces the itemised/summary boolean toggle with a 3-way view mode so a
-- "grouped" option (line items rolled up under named groups) can sit alongside
-- the existing itemised and summary views. summary_view is left in place
-- (unused going forward) rather than dropped, so this stays non-destructive.
alter table documents
  add column if not exists line_item_view text not null default 'itemised'
    check (line_item_view in ('itemised', 'summary', 'grouped'));

update documents set line_item_view = 'summary' where summary_view = true;
