// mystudiobee/src/lib/actions/time.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function clockIn(input: {
  project_id?: string;
  notes?: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");

  const supabase = await createClient();

  // Prevent double clock-in: check for any open entry
  const { data: open } = await supabase
    .from("time_entries")
    .select("id")
    .eq("employee_id", profile.id)
    .is("clocked_out_at", null)
    .maybeSingle();

  if (open) throw new Error("You already have an active clock-in. Clock out first.");

  const { error } = await supabase.from("time_entries").insert({
    employee_id: profile.id,
    project_id: input.project_id ?? null,
    notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/clock");
  revalidatePath("/reports/time");
}

export async function clockOut(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({ clocked_out_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("employee_id", profile.id); // RLS + owner check
  if (error) throw new Error(error.message);

  revalidatePath("/clock");
  revalidatePath("/reports/time");
}

export async function deleteTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (profile.role !== "owner" && profile.role !== "admin") {
    throw new Error("Only owner/admin can delete time entries");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw new Error(error.message);

  revalidatePath("/reports/time");
}
