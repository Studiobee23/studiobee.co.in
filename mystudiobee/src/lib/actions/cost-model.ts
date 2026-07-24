"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Not authorized — admin only.");
  }
  return profile;
}

// ── Cost roles ───────────────────────────────────────────────────────────
export async function upsertCostRole(input: { id?: string; name: string; hourly_rate: number }) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from("cost_roles").update({ name: input.name, hourly_rate: input.hourly_rate }).eq("id", input.id)
    : await supabase.from("cost_roles").insert({ name: input.name, hourly_rate: input.hourly_rate });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-model");
}

export async function setCostRoleActive(id: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cost_roles").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-model");
}

// ── Service presets ──────────────────────────────────────────────────────
export async function upsertServicePreset(input: {
  id?: string;
  category: string;
  name: string;
  preset_hours: Record<string, number>;
  default_overhead_ids: string[];
  default_markup_pct: number;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const payload = {
    category: input.category,
    name: input.name,
    preset_hours: input.preset_hours,
    default_overhead_ids: input.default_overhead_ids,
    default_markup_pct: input.default_markup_pct,
  };
  const { error } = input.id
    ? await supabase.from("service_presets").update(payload).eq("id", input.id)
    : await supabase.from("service_presets").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-model");
}

export async function deleteServicePreset(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("service_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-model");
}

export async function deleteCostRole(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cost_roles").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-model");
}
