import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { CostModelClient } from "./cost-model-client";

export default async function CostModelPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) redirect("/");

  const supabase = await createClient();
  const [{ data: roles }, { data: overheads }, { data: presets }] = await Promise.all([
    supabase.from("cost_roles").select("*").order("name"),
    supabase.from("overhead_items").select("*").order("name"),
    supabase.from("service_presets").select("*").order("category"),
  ]);

  return (
    <>
      <DashboardHeader title="Cost Model" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-5xl">
          <CostModelClient
            roles={roles ?? []}
            overheads={overheads ?? []}
            presets={presets ?? []}
          />
        </div>
      </div>
    </>
  );
}
