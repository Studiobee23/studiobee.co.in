import { redirect } from "next/navigation";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { HiresClient } from "./hires-client";

export default async function HiresPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    redirect("/");
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("external_hires")
    .select("*")
    .order("overall_rating", { ascending: false, nullsFirst: false });
  return <HiresClient items={data ?? []} />;
}
