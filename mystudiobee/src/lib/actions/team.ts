"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isAdminTier, isSuperAdmin, type Role } from "@/lib/profile";

async function requireAdminTier() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    throw new Error("Not authorized — admin only.");
  }
  return profile;
}

/** Only super_admin can grant super_admin, or change/deactivate/delete an existing
 * super_admin — otherwise any admin could promote a colleague (or get promoted by
 * one) to bypass the whole point of the tier. */
async function requireSuperAdminIfTargetIsOrBecomesSuperAdmin(
  callerRole: Role,
  targetId: string,
  newRole?: Role,
) {
  if (isSuperAdmin(callerRole)) return;
  if (newRole === "super_admin") {
    throw new Error("Only super_admin can grant the super_admin role.");
  }
  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", targetId).maybeSingle();
  if (target?.role === "super_admin") {
    throw new Error("Only super_admin can change another super_admin's account.");
  }
}

export async function inviteEmployee(input: { email: string; role: Role }) {
  const profile = await requireAdminTier();
  if (input.role === "super_admin" && !isSuperAdmin(profile.role)) {
    throw new Error("Only super_admin can invite a new super_admin.");
  }
  const admin = createAdminClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/accept-invite`,
  });
  if (error) throw new Error(error.message);

  const userId = data.user?.id;
  if (userId) {
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: userId, email: input.email, role: input.role, active: true });
    if (profileError) throw new Error(profileError.message);
  }

  revalidatePath("/admin/team");
}

export async function updateEmployeeRole(id: string, role: Role) {
  const profile = await requireAdminTier();
  if (id === profile.id) throw new Error("You can't change your own role.");
  await requireSuperAdminIfTargetIsOrBecomesSuperAdmin(profile.role, id, role);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

export async function updateEmployeeManager(id: string, managerId: string | null) {
  await requireAdminTier();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ manager_id: managerId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

export async function setEmployeeActive(id: string, active: boolean) {
  const profile = await requireAdminTier();
  if (id === profile.id) throw new Error("You can't deactivate your own account.");
  await requireSuperAdminIfTargetIsOrBecomesSuperAdmin(profile.role, id);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

/** Hard delete — their id is referenced (on delete set null) from tasks,
 * time_entries, documents, moms, etc., so history stays but shows no
 * attribution afterward. Prefer setEmployeeActive() for "they left"; this is
 * for correcting a mistaken invite or a genuine data-removal request. */
export async function deleteEmployee(id: string) {
  const profile = await requireAdminTier();
  if (id === profile.id) throw new Error("You can't delete your own account.");
  await requireSuperAdminIfTargetIsOrBecomesSuperAdmin(profile.role, id);
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").delete().eq("id", id);
  if (profileError) throw new Error(profileError.message);
  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError) throw new Error(authError.message);
  revalidatePath("/admin/team");
}
