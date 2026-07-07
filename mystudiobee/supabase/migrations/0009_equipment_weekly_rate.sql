-- mystudiobee/supabase/migrations/0009_equipment_weekly_rate.sql
alter table equipment
  add column if not exists weekly_rental_cost double precision;
