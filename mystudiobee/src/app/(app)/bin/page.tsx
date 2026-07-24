import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { BinClient } from "./bin-client";

export default async function BinPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) redirect("/");

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, city, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  return (
    <>
      <DashboardHeader title="Bin" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-5xl">
          <BinClient clients={clients ?? []} />
        </div>
      </div>
    </>
  );
}
