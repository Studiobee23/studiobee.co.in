-- Overhead items (purchase/recurring) get an hourly rate = cost / capacity_hours_per_month,
-- so a line item can bill only the hours an overhead was actually in use (e.g. a laptop
-- used for 8 of a 16-hour shoot day) instead of its full monthly-equivalent cost.
-- per_project items ignore this column and stay a flat one-off cost.
alter table overhead_items
  add column capacity_hours_per_month numeric not null default 160;
