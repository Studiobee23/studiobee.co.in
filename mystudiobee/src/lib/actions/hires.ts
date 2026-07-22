"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/profile";

function requireOwnerOrAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Unauthorised");
}

export async function upsertHire(input: {
  id?: string;
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  notes?: string;
  rating_skill_quality?: number;
  rating_reliability?: number;
  rating_professionalism?: number;
  rating_price?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { id, ...rest } = input;
  const { error } = id
    ? await supabase.from("external_hires").update(rest).eq("id", id)
    : await supabase.from("external_hires").insert(rest);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/hires");
}

export async function setHireActive(id: string, active: boolean) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("external_hires").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/hires");
}

export async function linkHireToProject(input: { project_id: string; hire_id: string; role_on_shoot?: string; notes?: string }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("project_hires").insert(input);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${input.project_id}`);
}

export async function unlinkHireFromProject(id: string, projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("project_hires").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}
