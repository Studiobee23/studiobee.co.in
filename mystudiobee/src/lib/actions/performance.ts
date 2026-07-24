"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminTier, isSuperAdmin } from "@/lib/profile";
import type { PointReason, PointEvent, EmployeeScore } from "@/lib/performance/types";

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || !isSuperAdmin(profile.role)) {
    throw new Error("Not authorized — super_admin only.");
  }
  return profile;
}

// ── Point reasons (super_admin only) ────────────────────────────────────

export async function getPointReasons(): Promise<PointReason[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data, error } = await supabase.from("point_reasons").select("*").order("label");
  if (error) throw new Error(error.message);
  return (data ?? []) as PointReason[];
}

export async function upsertPointReason(input: { id?: string; label: string; points: number }) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const payload = { label: input.label, points: input.points };
  const { error } = input.id
    ? await supabase.from("point_reasons").update(payload).eq("id", input.id)
    : await supabase.from("point_reasons").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function setPointReasonActive(id: string, active: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("point_reasons").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

// ── Point events ─────────────────────────────────────────────────────────

export async function getEmployeeScores(): Promise<EmployeeScore[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  // super_admin sees everyone below them (admin/manager/employee); admin/manager only
  // ever see the employee roster — peers scoring peers doesn't make sense here.
  const rosterRoles = isSuperAdmin(profile.role) ? ["admin", "manager", "employee"] : ["employee"];

  const [{ data: employees, error: empError }, { data: events, error: evError }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, email, role, manager_id").in("role", rosterRoles).eq("active", true),
    supabase.from("point_events").select("employee_id, points"),
  ]);
  if (empError) throw new Error(empError.message);
  if (evError) throw new Error(evError.message);

  const scoreByEmployee = new Map<string, number>();
  for (const e of events ?? []) {
    scoreByEmployee.set(e.employee_id, (scoreByEmployee.get(e.employee_id) ?? 0) + e.points);
  }

  return (employees ?? []).map((e) => ({
    id: e.id,
    display_name: e.display_name,
    email: e.email,
    role: e.role,
    manager_id: e.manager_id,
    score: scoreByEmployee.get(e.id) ?? 0,
  }));
}

export async function getPointEvents(employeeId?: string): Promise<PointEvent[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  let query = supabase
    .from("point_events")
    .select("id, employee_id, reason_id, points, note, logged_by, created_at, point_reasons(label)")
    .order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const reason = row.point_reasons as unknown as { label: string } | null;
    return {
      id: row.id,
      employee_id: row.employee_id,
      reason_id: row.reason_id,
      points: row.points,
      note: row.note,
      logged_by: row.logged_by,
      created_at: row.created_at,
      reason_label: reason?.label ?? "—",
    };
  });
}

export async function logPointEvent(input: { employeeId: string; reasonId: string; note?: string }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("role, manager_id").eq("id", input.employeeId).maybeSingle();

  if (profile.role === "manager") {
    if (target?.manager_id !== profile.id) throw new Error("You can only log points for your own reports.");
  } else if (!isAdminTier(profile.role)) {
    throw new Error("Unauthorised");
  } else if (target?.role !== "employee" && !isSuperAdmin(profile.role)) {
    throw new Error("Only super_admin can log points for non-employee roles.");
  }

  const { data: reason, error: reasonError } = await supabase.from("point_reasons").select("points").eq("id", input.reasonId).single();
  if (reasonError) throw new Error(reasonError.message);

  const { error } = await supabase.from("point_events").insert({
    employee_id: input.employeeId,
    reason_id: input.reasonId,
    points: reason.points,
    note: input.note ?? "",
    logged_by: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function updatePointEvent(id: string, note: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  if (!isAdminTier(profile.role)) {
    const { data: existing } = await supabase.from("point_events").select("logged_by").eq("id", id).maybeSingle();
    if (existing?.logged_by !== profile.id) throw new Error("You can only edit events you logged.");
  } else {
    const { data: existing } = await supabase
      .from("point_events")
      .select("profiles!employee_id(role)")
      .eq("id", id)
      .maybeSingle();
    const targetRole = (existing?.profiles as unknown as { role: string } | null)?.role;
    if (targetRole !== "employee" && !isSuperAdmin(profile.role)) {
      throw new Error("Only super_admin can modify points for non-employee roles.");
    }
  }

  const { error } = await supabase.from("point_events").update({ note }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function deletePointEvent(id: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  if (!isAdminTier(profile.role)) {
    const { data: existing } = await supabase.from("point_events").select("logged_by").eq("id", id).maybeSingle();
    if (existing?.logged_by !== profile.id) throw new Error("You can only delete events you logged.");
  } else {
    const { data: existing } = await supabase
      .from("point_events")
      .select("profiles!employee_id(role)")
      .eq("id", id)
      .maybeSingle();
    const targetRole = (existing?.profiles as unknown as { role: string } | null)?.role;
    if (targetRole !== "employee" && !isSuperAdmin(profile.role)) {
      throw new Error("Only super_admin can modify points for non-employee roles.");
    }
  }

  const { error } = await supabase.from("point_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}
