import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { getProfitSplitSettings } from "@/lib/actions/profit-split";
import { ProfitSplitClient } from "./profit-split-client";

export default async function ProfitSplitPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }
  const settings = await getProfitSplitSettings();
  return <ProfitSplitClient settings={settings} />;
}
