import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPointEvents, getEmployeeScores, getPointReasons } from "@/lib/actions/performance";
import { getProfitSplitSettings } from "@/lib/actions/profit-split";
import { ClockClient } from "../clock/clock-client";
import { PerformanceClient } from "../performance/performance-client";

export default async function TimePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { tab } = await searchParams;
  const defaultTab = tab === "performance" ? "performance" : "clock";

  const supabase = await createClient();

  const [
    { data: activeEntries },
    { data: recentEntries },
    { data: clockProjects },
    myEvents,
    scores,
    reasons,
    profitSplitSettings,
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, clocked_in_at, project_id, notes, clock_in_location_label, projects(name), paused_at, paused_seconds")
      .eq("employee_id", profile.id)
      .is("clocked_out_at", null)
      .is("deleted_at", null)
      .order("clocked_in_at", { ascending: false })
      .limit(1),
    supabase
      .from("time_entries")
      .select(
        "id, clocked_in_at, clocked_out_at, notes, project_id, clock_in_location_label, clock_out_location_label, projects(name), paused_seconds"
      )
      .eq("employee_id", profile.id)
      .not("clocked_out_at", "is", null)
      .is("deleted_at", null)
      .order("clocked_in_at", { ascending: false })
      .limit(10),
    supabase.from("projects").select("id, name").eq("status", "active").is("deleted_at", null).order("name"),
    profile.role === "employee" ? getPointEvents() : Promise.resolve([]),
    profile.role !== "employee" ? getEmployeeScores() : Promise.resolve([]),
    profile.role !== "employee" ? getPointReasons() : Promise.resolve([]),
    profile.role === "super_admin" ? getProfitSplitSettings() : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader title="Time & Performance" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="clock">Clock In</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          <TabsContent value="clock" className="mt-4">
            <ClockClient
              profile={{ id: profile.id, display_name: profile.display_name }}
              activeEntry={activeEntries?.[0] ?? null}
              recentEntries={recentEntries ?? []}
              projects={clockProjects ?? []}
            />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <PerformanceClient
              role={profile.role}
              profileId={profile.id}
              myEvents={myEvents}
              scores={scores}
              reasons={reasons}
              profitSplitSettings={profitSplitSettings}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
