import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) redirect("/");

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active, manager_id")
    .order("email");

  return (
    <>
      <DashboardHeader title="Team" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-4xl">
          <TeamClient employees={employees ?? []} currentUserId={profile.id} />
        </div>
      </div>
    </>
  );
}
