"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/profile";

function requireOwnerOrAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Unauthorised");
}

export async function upsertEquipment(input: {
  id?: string;
  name: string;
  description?: string;
  purchase_date?: string;
  purchase_cost?: number;
  gst_amount?: number;
  receipt_url?: string;
  daily_rental_cost?: number;
  weekly_rental_cost?: number;
  useful_life_days?: number;
  weekly_discount_pct?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { id, ...rest } = input;
  const { error } = id
    ? await supabase.from("equipment").update(rest).eq("id", id)
    : await supabase.from("equipment").insert(rest);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}

export async function setEquipmentActive(id: string, active: boolean) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("equipment")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}
