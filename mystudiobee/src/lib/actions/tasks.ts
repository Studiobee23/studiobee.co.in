"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createTask(input: {
  project_id?: string;
  title: string;
  description?: string;
  assignee_id?: string;
  due_date?: string;
  payment_linked?: boolean;
  payment_amount?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .insert({ ...input, created_by: profile.id });
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
