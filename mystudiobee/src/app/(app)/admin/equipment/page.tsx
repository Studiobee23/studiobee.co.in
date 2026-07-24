import { redirect } from "next/navigation";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipmentClient } from "./equipment-client";
import { InternalCostingClient } from "./internal-costing-client";

export default async function EquipmentPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    redirect("/");
  }
  const supabase = createAdminClient();
  const [{ data: equipment }, { data: overheads }] = await Promise.all([
    supabase.from("equipment").select("*").order("name"),
    supabase.from("overhead_items").select("*").order("name"),
  ]);

  return (
    <>
      <DashboardHeader title="Equipment & Internal Costing" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Tabs defaultValue="equipment">
          <TabsList>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="internal-costing">Internal Costing</TabsTrigger>
          </TabsList>
          <TabsContent value="equipment" className="mt-4">
            <EquipmentClient items={equipment ?? []} />
          </TabsContent>
          <TabsContent value="internal-costing" className="mt-4">
            <InternalCostingClient items={overheads ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
