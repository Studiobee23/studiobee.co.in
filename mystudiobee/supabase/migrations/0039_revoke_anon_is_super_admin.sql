-- is_super_admin() (added in 0032_employee_performance_points.sql) was never
-- added to the anon/public revoke pass that 0027_security_hardening.sql did
-- for is_billing_role()/is_owner_or_admin() — Supabase's security advisor
-- flags it as callable by anon via /rest/v1/rpc/is_super_admin. Practical
-- impact is minimal (it only evaluates the caller's own role and returns
-- false for anon), but tighten it for consistency with its sibling functions.

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;
