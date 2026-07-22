-- Internal Costing: relocate "Overhead Items" admin UI from Cost Model into the
-- Equipment tab, and support amortized one-time purchases (e.g. laptops) alongside
-- the existing flat recurring/per-project costs (e.g. subscriptions).

alter table overhead_items
  add column if not exists costing_type text not null default 'recurring'
    check (costing_type in ('purchase', 'recurring', 'per_project')),
  add column if not exists purchase_cost numeric(12,2),
  add column if not exists useful_life_months integer;

-- Backfill from the old cosmetic `type` column before dropping it.
update overhead_items set costing_type = 'recurring' where type = 'monthly';
update overhead_items set costing_type = 'per_project' where type = 'per-project';

alter table overhead_items drop column type;
