-- mystudiobee/supabase/migrations/0008_time_entries_location.sql
alter table time_entries
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_label text;
