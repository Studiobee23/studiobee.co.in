"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/profile";
import type { ProfitSplitTier } from "@/lib/profit-split/engine";

function requireOwnerOrAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Unauthorised");
}

export async function upsertProfitSplitSettings(input: {
  category: string;
  floor: number;
  threshold: number;
  tiers: ProfitSplitTier[];
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profit_split_settings")
    .upsert({ ...input }, { onConflict: "category" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/profit-split");
}

export async function getProfitSplitSettings() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profit_split_settings")
    .select("*")
    .order("category");
  if (error) throw new Error(error.message);
  return data ?? [];
}
