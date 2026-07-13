-- mystudiobee/supabase/migrations/0014_equipment_auto_rate_fields.sql
alter table equipment
  add column if not exists useful_life_days integer,
  add column if not exists weekly_discount_pct double precision;
