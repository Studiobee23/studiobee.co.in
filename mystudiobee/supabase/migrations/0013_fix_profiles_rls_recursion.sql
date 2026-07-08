-- mystudiobee/supabase/migrations/0013_fix_profiles_rls_recursion.sql
-- The "active users read active profiles for assignment" policy added in 0012
-- checked the caller's own active status via `exists (select ... from profiles
-- where id = auth.uid())` — a subquery into the SAME table the policy is on.
-- Postgres re-applies RLS when evaluating that subquery, which needs to
-- evaluate this same policy again -> infinite recursion. This broke ALL
-- profile reads for every non-owner/admin role (any query touching `profiles`
-- errored with "infinite recursion detected in policy for relation
-- profiles"), which is how the employee login redirect loop was actually
-- happening — getCurrentProfile() itself failed after sign-in.
drop policy if exists "active users read active profiles for assignment" on profiles;

create policy "active users read active profiles for assignment" on profiles
  for select using (active);
