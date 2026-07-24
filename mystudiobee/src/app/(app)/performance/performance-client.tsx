"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Role } from "@/lib/profile";
import type { PointEvent, EmployeeScore, PointReason } from "@/lib/performance/types";
import type { ProfitSplitSettings } from "@/lib/profit-split/engine";
import { MyHistory } from "./my-history";
import { TeamScores } from "./team-scores";
import { PointReasonsTab } from "./point-reasons-tab";
import { ProfitSplitTab } from "./profit-split-tab";

export function PerformanceClient({
  role,
  profileId,
  myEvents,
  scores,
  reasons,
  profitSplitSettings,
}: {
  role: Role;
  profileId: string;
  myEvents: PointEvent[];
  scores: EmployeeScore[];
  reasons: PointReason[];
  profitSplitSettings: ProfitSplitSettings[];
}) {
  if (role === "employee") {
    return <MyHistory events={myEvents} />;
  }

  if (role !== "super_admin") {
    return <TeamScores scores={scores} reasons={reasons} role={role} profileId={profileId} />;
  }

  return (
    <Tabs defaultValue="scores">
      <TabsList>
        <TabsTrigger value="scores">Team Scores</TabsTrigger>
        <TabsTrigger value="reasons">Point Reasons</TabsTrigger>
        <TabsTrigger value="profit-split">Profit Split</TabsTrigger>
      </TabsList>
      <TabsContent value="scores" className="mt-4">
        <TeamScores scores={scores} reasons={reasons} role={role} profileId={profileId} />
      </TabsContent>
      <TabsContent value="reasons" className="mt-4">
        <PointReasonsTab reasons={reasons} />
      </TabsContent>
      <TabsContent value="profit-split" className="mt-4">
        <ProfitSplitTab settings={profitSplitSettings} />
      </TabsContent>
    </Tabs>
  );
}
