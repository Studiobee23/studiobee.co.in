-- Internal Costing: recurring items previously stored a flat number with no unit,
-- silently treated as "monthly" everywhere it was used (P&L deduction, preset cost).
-- Add an explicit billing period so an annual/quarterly subscription can be entered
-- at its real cadence and auto-converted to a monthly-equivalent, same amortization
-- pattern as one-time purchases (purchase_cost / useful_life_months).

alter table overhead_items
  add column if not exists billing_period text
    check (billing_period in ('monthly', 'quarterly', 'annual')),
  add column if not exists recurring_amount numeric(12,2);

-- Backfill: existing recurring items' `cost` was already being treated as a monthly
-- figure, so preserve that behavior exactly — monthly period, recurring_amount = cost.
update overhead_items
set billing_period = 'monthly', recurring_amount = cost
where costing_type = 'recurring';
