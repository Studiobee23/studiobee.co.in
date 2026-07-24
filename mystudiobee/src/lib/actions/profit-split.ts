"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isSuperAdmin, type Role } from "@/lib/profile";
import type { ProfitSplitTier } from "@/lib/profit-split/engine";

function requireSuperAdmin(role: Role) {
  if (!isSuperAdmin(role)) throw new Error("Unauthorised — super_admin only.");
}

export async function upsertProfitSplitSettings(input: {
  category: string;
  floor: number;
  threshold: number;
  tiers: ProfitSplitTier[];
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireSuperAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profit_split_settings")
    .upsert({ ...input }, { onConflict: "category" });
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function getProfitSplitSettings() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireSuperAdmin(profile.role);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profit_split_settings")
    .select("*")
    .order("category");
  if (error) throw new Error(error.message);
  return data ?? [];
}
