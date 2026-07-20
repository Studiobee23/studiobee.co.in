import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ClockClient } from "./clock-client";

export default async function ClockPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // Active (open) entry for this user — order+limit instead of .maybeSingle()
  // so a stale duplicate open row (pre-existing the unique index) can't make
  // this silently error out and hide the fact that the user is clocked in.
  const { data: activeEntries } = await supabase
    .from("time_entries")
    .select("id, clocked_in_at, project_id, notes, location_label, projects(name)")
    .eq("employee_id", profile.id)
    .is("clocked_out_at", null)
    .order("clocked_in_at", { ascending: false })
    .limit(1);
  const activeEntry = activeEntries?.[0] ?? null;

  // Last 10 completed entries
  const { data: recentEntries } = await supabase
    .from("time_entries")
    .select("id, clocked_in_at, clocked_out_at, notes, project_id, location_label, projects(name)")
    .eq("employee_id", profile.id)
    .not("clocked_out_at", "is", null)
    .order("clocked_in_at", { ascending: false })
    .limit(10);

  // Projects for the "select project" dropdown (active only)
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("status", "active")
    .is("deleted_at", null)
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
