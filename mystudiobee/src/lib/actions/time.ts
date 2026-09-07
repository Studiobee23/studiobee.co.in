// mystudiobee/src/lib/actions/time.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
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

  revalidatePath("/time-performance");
  revalidatePath("/reports");
  return data.id as string;
}

export async function clockOut(entryId: string, location: { latitude: number; longitude: number }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (location.latitude == null || location.longitude == null) {
    throw new Error("Location is required to clock out.");
  }

  const supabase = await createClient();

  // Fold any in-progress pause into paused_seconds so worked-time math (workedMs)
  // stays correct once clocked_out_at is set and paused_at goes back to null.
  const { data: entry, error: fetchError } = await supabase
    .from("time_entries")
    .select("paused_at, paused_seconds")
    .eq("id", entryId)
    .eq("employee_id", profile.id)
    .single();
  if (fetchError) throw new Error("Time entry not found.");

  const pausedSeconds = entry.paused_at
    ? (entry.paused_seconds ?? 0) + Math.round((Date.now() - new Date(entry.paused_at).getTime()) / 1000)
    : (entry.paused_seconds ?? 0);

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
      paused_at: null,
      paused_seconds: pausedSeconds,
    })
    .eq("id", entryId)
    .eq("employee_id", profile.id); // RLS + owner check
  if (error) throw new Error(error.message);

  revalidatePath("/time-performance");
  revalidatePath("/reports");
}

export async function pauseTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("time_entries")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("employee_id", profile.id)
    .is("clocked_out_at", null)
    .is("paused_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Entry is already paused, clocked out, or not yours.");

  revalidatePath("/time-performance");
  revalidatePath("/reports");
}

export async function resumeTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  const { data: entry, error: fetchError } = await supabase
    .from("time_entries")
    .select("paused_at, paused_seconds")
    .eq("id", entryId)
    .eq("employee_id", profile.id)
    .single();
  if (fetchError) throw new Error("Time entry not found.");
  if (!entry.paused_at) throw new Error("Entry is not paused.");

  const pausedSeconds = (entry.paused_seconds ?? 0) + Math.round((Date.now() - new Date(entry.paused_at).getTime()) / 1000);

  const { error } = await supabase
    .from("time_entries")
    .update({ paused_at: null, paused_seconds: pausedSeconds })
    .eq("id", entryId)
    .eq("employee_id", profile.id);
  if (error) throw new Error(error.message);

  revalidatePath("/time-performance");
  revalidatePath("/reports");
}

export async function deleteTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (!isAdminTier(profile.role)) {
    throw new Error("Only admin can delete time entries");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw new Error(error.message);

  revalidatePath("/time-performance");
  revalidatePath("/reports");
}

export async function restoreTimeEntry(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (!isAdminTier(profile.role)) {
    throw new Error("Only admin can restore time entries");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({ deleted_at: null })
    .eq("id", entryId);
  if (error) throw new Error(error.message);

  revalidatePath("/time-performance");
  revalidatePath("/reports");
}
