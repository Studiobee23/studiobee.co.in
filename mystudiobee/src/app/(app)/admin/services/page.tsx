import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ServicesClient } from "./services-client";

export default async function ServicesPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) redirect("/");

  const supabase = await createClient();
  const [{ data: roles }, { data: overheads }, { data: presets }] = await Promise.all([
    supabase.from("cost_roles").select("*").order("name"),
    supabase.from("overhead_items").select("*").order("name"),
    supabase.from("service_presets").select("*").order("category"),
  ]);

  return (
    <>
      <DashboardHeader title="Services" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-5xl">
          <ServicesClient
            roles={roles ?? []}
            overheads={overheads ?? []}
            presets={presets ?? []}
          />
        </div>
      </div>
    </>
  );
}
