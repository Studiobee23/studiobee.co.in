import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ClockClient } from "./clock-client";

export default async function ClockPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // Active (open) entry for this user
  const { data: activeEntry } = await supabase
    .from("time_entries")
    .select("id, clocked_in_at, project_id, notes, projects(name)")
    .eq("employee_id", profile.id)
    .is("clocked_out_at", null)
    .maybeSingle();

  // Last 10 completed entries
  const { data: recentEntries } = await supabase
    .from("time_entries")
    .select("id, clocked_in_at, clocked_out_at, notes, project_id, projects(name)")
    .eq("employee_id", profile.id)
    .not("clocked_out_at", "is", null)
    .order("clocked_in_at", { ascending: false })
    .limit(10);

  // Projects for the "select project" dropdown (active only)
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  return (
    <>
      <DashboardHeader title="Clock In / Out" />
      <ClockClient
        profile={{ id: profile.id, display_name: profile.display_name }}
        activeEntry={activeEntry ?? null}
        recentEntries={recentEntries ?? []}
        projects={projects ?? []}
      />
    </>
  );
}
