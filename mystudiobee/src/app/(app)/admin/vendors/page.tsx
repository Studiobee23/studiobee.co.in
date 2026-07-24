import { redirect } from "next/navigation";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { VendorsClient } from "./vendors-client";

export default async function VendorsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    redirect("/");
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("equipment_vendors")
    .select("*")
    .order("overall_rating", { ascending: false, nullsFirst: false });
  return <VendorsClient items={data ?? []} />;
}
