import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isBillingRole, canSeeCost } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuoteEditor } from "../quote-editor";

export default async function NewQuotePage() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const supabase = await createClient();
  const seeCost = canSeeCost(profile.role);

  const [{ data: clients }, { data: presets }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("service_presets").select("*").order("category"),
  ]);

  // Roles/overheads are owner/admin-only via RLS; managers never receive these rows —
  // the preset picker in the editor only needs names, which presets already carry.
  let roles: { id: string; name: string; hourly_rate: number }[] = [];
  let overheads: { id: string; name: string; cost: number }[] = [];
  if (seeCost) {
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from("cost_roles").select("id, name, hourly_rate").eq("active", true),
      supabase.from("overhead_items").select("id, name, cost").eq("active", true),
    ]);
    roles = r ?? [];
    overheads = o ?? [];
  } else {
    // Managers still need role/overhead *names* to build the "hours per role" form —
    // fetched via the admin client (bypasses RLS) but rates/costs are stripped here so
    // the manager's browser never receives them.
    const admin = createAdminClient();
    const [{ data: r }, { data: o }] = await Promise.all([
      admin.from("cost_roles").select("id, name").eq("active", true),
      admin.from("overhead_items").select("id, name").eq("active", true),
    ]);
    roles = (r ?? []).map((x) => ({ ...x, hourly_rate: 0 }));
    overheads = (o ?? []).map((x) => ({ ...x, cost: 0 }));
  }

  return (
    <>
      <DashboardHeader title="New Quote" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-3xl">
          <QuoteEditor
            clients={clients ?? []}
            presets={presets ?? []}
            roles={roles}
            overheads={overheads}
            canSeeCost={seeCost}
          />
        </div>
      </div>
    </>
  );
}
