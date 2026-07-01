import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) redirect("/");

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active")
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
