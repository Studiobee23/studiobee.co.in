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

// ── Internal costing items ("Overhead Items" table, relocated from Cost Model) ──
export async function upsertOverheadItem(input: {
  id?: string;
  name: string;
  cost: number;
  costing_type: "purchase" | "recurring" | "per_project";
  purchase_cost?: number | null;
  useful_life_months?: number | null;
  billing_period?: "monthly" | "quarterly" | "annual" | null;
  recurring_amount?: number | null;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const payload = {
    name: input.name,
    cost: input.cost,
    costing_type: input.costing_type,
    purchase_cost: input.purchase_cost ?? null,
    useful_life_months: input.useful_life_months ?? null,
    billing_period: input.billing_period ?? null,
    recurring_amount: input.recurring_amount ?? null,
  };
  const { error } = input.id
    ? await supabase.from("overhead_items").update(payload).eq("id", input.id)
    : await supabase.from("overhead_items").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}

export async function setOverheadItemActive(id: string, active: boolean) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("overhead_items").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}

export async function deleteOverheadItem(id: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("overhead_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}
