import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS entirely. Server-only (never import from a
 * Client Component). Used for: inviting employees (auth.admin.inviteUserByEmail) and
 * the cost-calculation server action that resolves preset prices for `manager` sessions
 * without ever sending raw cost_roles/overhead_items rows to their browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
