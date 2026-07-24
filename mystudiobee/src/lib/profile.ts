import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "manager" | "employee";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  active: boolean;
};

/** Current signed-in user's profile. proxy.ts already guarantees a session + active
 * profile exists for any route this is called from, so this should never return null
 * in practice — but callers should still handle it defensively. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active")
    .eq("id", userData.user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
});

export function canSeeCost(role: Role) {
  return role === "admin";
}

export function isBillingRole(role: Role) {
  return role === "admin" || role === "manager";
}
