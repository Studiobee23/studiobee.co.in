"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createTask(input: {
  project_id?: string;
  title: string;
  description?: string;
  assigned_to?: string;
  due_date?: string;
  payment_linked?: boolean;
  payment_amount?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    // Default to the creator so a task never ends up assigned to nobody —
    // an unassigned task is invisible in every employee's filtered task view.
    .insert({ ...input, assigned_to: input.assigned_to ?? profile.id, created_by: profile.id });
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  if (input.project_id) revalidatePath(`/projects/${input.project_id}`);
}

export async function updateTaskStatus(
  id: string,
  status: "pending" | "in_progress" | "delayed" | "completed"
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}

export async function updateTaskAssignee(id: string, assignedTo: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}

export async function deleteTask(id: string, project_id?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  if (project_id) revalidatePath(`/projects/${project_id}`);
}
