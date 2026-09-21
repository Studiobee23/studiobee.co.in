-- Per-group category + executor overrides so a single document mixing service
-- categories (e.g. design + video line items in one bill) can compute a
-- separate profit-split pool per group instead of forcing the whole document
-- into one category and one executor. Keyed by the existing free-text
-- `LineItem.group` label; ungrouped items keep using the document's own
-- category/executor_id as before.
alter table documents add column group_assignments jsonb;
