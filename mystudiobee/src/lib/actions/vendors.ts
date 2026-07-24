"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isAdminTier, type Role } from "@/lib/profile";

function requireAdminTier(role: Role) {
  if (!isAdminTier(role)) throw new Error("Unauthorised");
}

export async function upsertVendor(input: {
  id?: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  rating_equipment_quality?: number;
  rating_price?: number;
  rating_vendor_quality?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireAdminTier(profile.role);
  const supabase = createAdminClient();
  const { id, ...rest } = input;
  const { error } = id
    ? await supabase.from("equipment_vendors").update(rest).eq("id", id)
    : await supabase.from("equipment_vendors").insert(rest);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/vendors");
}

export async function setVendorActive(id: string, active: boolean) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireAdminTier(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("equipment_vendors").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/vendors");
}

export async function linkVendorToProject(input: { project_id: string; vendor_id: string; notes?: string }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireAdminTier(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("project_vendors").insert(input);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${input.project_id}`);
}

export async function unlinkVendorFromProject(id: string, projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireAdminTier(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("project_vendors").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}
