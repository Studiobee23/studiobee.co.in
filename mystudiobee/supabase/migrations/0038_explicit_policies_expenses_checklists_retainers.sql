-- 0027_security_hardening.sql dropped the old (accidentally-permissive
-- USING(true)) policies on project_expenses/delivery_checklists/
-- retainer_months, but no replacement policy exists in any tracked migration
-- afterward — migrations 0004-0006 are missing from version control, so
-- whatever currently governs these tables in production isn't reproducible
-- from this repo. The corresponding server actions (projects.ts:
-- deleteExpense, createChecklistItem/toggleChecklistItem/deleteChecklistItem,
-- upsertRetainerMonth) also have no application-layer role check — they rely
-- entirely on RLS. This migration is additive/idempotent: it doesn't assume
-- anything about what's currently live, it just guarantees a correct
-- is_billing_role()-gated policy exists on all three tables going forward,
-- matching the pattern already used for project_stages (0003_phase1_phase2.sql).

alter table project_expenses enable row level security;
alter table delivery_checklists enable row level security;
alter table retainer_months enable row level security;

drop policy if exists "billing roles manage project_expenses" on project_expenses;
create policy "billing roles manage project_expenses" on project_expenses
  for all using (is_billing_role()) with check (is_billing_role());

drop policy if exists "billing roles manage delivery_checklists" on delivery_checklists;
create policy "billing roles manage delivery_checklists" on delivery_checklists
  for all using (is_billing_role()) with check (is_billing_role());

drop policy if exists "billing roles manage retainer_months" on retainer_months;
create policy "billing roles manage retainer_months" on retainer_months
  for all using (is_billing_role()) with check (is_billing_role());
