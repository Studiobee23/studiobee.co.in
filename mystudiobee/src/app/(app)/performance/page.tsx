import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getPointEvents, getEmployeeScores, getPointReasons } from "@/lib/actions/performance";
import { getProfitSplitSettings } from "@/lib/actions/profit-split";
import { PerformanceClient } from "./performance-client";

export default async function PerformancePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const myEvents = profile.role === "employee" ? await getPointEvents() : [];
  const scores = profile.role !== "employee" ? await getEmployeeScores() : [];
  const reasons = profile.role !== "employee" ? await getPointReasons() : [];
  const profitSplitSettings = profile.role === "super_admin" ? await getProfitSplitSettings() : [];

  return (
    <>
      <DashboardHeader title="Performance" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PerformanceClient
          role={profile.role}
          profileId={profile.id}
          myEvents={myEvents}
          scores={scores}
          reasons={reasons}
          profitSplitSettings={profitSplitSettings}
        />
      </div>
    </>
  );
}
