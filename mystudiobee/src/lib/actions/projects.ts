"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createProject(input: {
  name: string;
  description?: string;
  category?: string;
  type: "project" | "retainer";
  client_id?: string;
  est_hours?: number;
  start_date?: string;
  end_date?: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...input, created_by: profile.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  return data.id as string;
}

export async function updateProject(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    category: string;
    type: "project" | "retainer";
    status: "active" | "on_hold" | "completed" | "cancelled";
    client_id: string;
    est_hours: number;
    start_date: string;
    end_date: string;
  }>
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function completeProjectStage(
  projectId: string,
  stage: string,
  notes?: string
) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_stages").upsert(
    {
      project_id: projectId,
      stage,
      completed_at: new Date().toISOString(),
      notes: notes ?? "",
    },
    { onConflict: "project_id,stage" }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function uncompleteProjectStage(projectId: string, stage: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_stages")
    .update({ completed_at: null })
    .eq("project_id", projectId)
    .eq("stage", stage);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectStatus(
  id: string,
  status: "active" | "on_hold" | "completed" | "cancelled"
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function createExpense(input: {
  project_id: string;
  category: string;
  description: string;
  amount: number;
  gst_amount?: number;
  vendor?: string;
  expense_date?: string;
  receipt_url?: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_expenses")
    .insert({ ...input, gst_amount: input.gst_amount ?? 0, created_by: profile.id });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${input.project_id}`);
}

export async function deleteExpense(id: string, project_id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${project_id}`);
}

export async function createChecklistItem(project_id: string, item: string, sort_order: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("delivery_checklists")
    .insert({ project_id, item, sort_order });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${project_id}`);
}

export async function toggleChecklistItem(id: string, completed: boolean, project_id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("delivery_checklists")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${project_id}`);
}

export async function deleteChecklistItem(id: string, project_id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_checklists").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${project_id}`);
}

export async function upsertRetainerMonth(input: {
  project_id: string;
  month: string;
  status: "pending" | "in_progress" | "completed" | "invoiced";
  notes?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("retainer_months")
    .upsert({ ...input }, { onConflict: "project_id,month" });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${input.project_id}`);
}

export async function createMom(input: {
  project_id?: string;
  client_id?: string;
  title: string;
  content: string;
  attendees?: string[];
  meeting_date?: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { error } = await supabase
    .from("moms")
    .insert({ ...input, created_by: profile.id });
  if (error) throw new Error(error.message);
  if (input.project_id) revalidatePath(`/projects/${input.project_id}`);
}
