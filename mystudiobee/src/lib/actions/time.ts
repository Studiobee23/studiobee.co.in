// mystudiobee/src/lib/actions/time.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { reverseGeocode } from "@/lib/geocode";

export async function clockIn(input: {
  project_id?: string;
  notes?: string;
  clock_in_photo_path: string;
  latitude: number;
  longitude: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (!input.clock_in_photo_path) throw new Error("A clock-in photo is required.");
  if (input.latitude == null || input.longitude == null) throw new Error("Location is required to clock in.");

  const supabase = await createClient();

  // Prevent double clock-in: check for any open entry (not .maybeSingle() —
  // that throws if a stale duplicate row exists and would mask the real state)
  const { data: open } = await supabase
    .from("time_entries")
    .select("id")
    .eq("employee_id", profile.id)
    .is("clocked_out_at", null)
    .order("clocked_in_at", { ascending: false })
    .limit(1);

  if (open && open.length > 0) throw new Error("You already have an active clock-in. Clock out first.");

  const clockInLocationLabel =
    (await reverseGeocode(input.latitude, input.longitude)) ??
    `${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`;

  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      employee_id: profile.id,
      project_id: input.project_id ?? null,
      notes: input.notes ?? null,
      clock_in_photo_path: input.clock_in_photo_path,
      clock_in_latitude: input.latitude,
      clock_in_longitude: input.longitude,
      clock_in_location_label: clockInLocationLabel,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/clock");
  revalidatePath("/reports/time");
  return data.id as string;
}

export async function clockOut(entryId: string, location: { latitude: number; longitude: number }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (location.latitude == null || location.longitude == null) {
    throw new Error("Location is required to clock out.");
  }

  const supabase = await createClient();

  const clockOutLocationLabel =
    (await reverseGeocode(location.latitude, location.longitude)) ??
    `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;

  const { error } = await supabase
    .from("time_entries")
    .update({
      clocked_out_at: new Date().toISOString(),
      clock_out_latitude: location.latitude,
      clock_out_longitude: location.longitude,
      clock_out_location_label: clockOutLocationLabel,
    })
    .eq("id", entryId)
    .eq("employee_id", profile.id); // RLS + owner check
  if (error) throw new Error(error.message);

  revalidatePath("/clock");
  revalidatePath("/reports/time");
}

export async function deleteTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (profile.role !== "admin") {
    throw new Error("Only admin can delete time entries");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw new Error(error.message);

  revalidatePath("/clock");
  revalidatePath("/reports/time");
}

export async function restoreTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (profile.role !== "admin") {
    throw new Error("Only admin can restore time entries");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({ deleted_at: null })
    .eq("id", entryId);
  if (error) throw new Error(error.message);

  revalidatePath("/clock");
  revalidatePath("/reports/time");
}
