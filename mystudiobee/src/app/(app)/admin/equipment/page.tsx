import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { EquipmentClient } from "./equipment-client";

export default async function EquipmentPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    redirect("/");
  }
  const supabase = createAdminClient();
  const { data } = await supabase.from("equipment").select("*").order("name");
  return <EquipmentClient items={data ?? []} />;
}
