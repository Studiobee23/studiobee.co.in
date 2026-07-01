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
