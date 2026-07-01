"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, type Role } from "@/lib/profile";

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    throw new Error("Not authorized — owner/admin only.");
  }
  return profile;
}

export async function inviteEmployee(input: { email: string; role: Role }) {
  await requireOwnerOrAdmin();
  const admin = createAdminClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${siteUrl}/accept-invite`,
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
  const profile = await requireOwnerOrAdmin();
  if (id === profile.id) throw new Error("You can't change your own role.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

export async function setEmployeeActive(id: string, active: boolean) {
  const profile = await requireOwnerOrAdmin();
  if (id === profile.id) throw new Error("You can't deactivate your own account.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}
