import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { TasksClient } from "./tasks-client";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const isEmployee = profile.role === "employee";

  let query = supabase
    .from("tasks")
    .select("*, projects(name), profiles!assigned_to(display_name, email)")
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (isEmployee) {
    query = query.eq("assigned_to", profile.id);
  }

  const { data: tasks } = await query;
  const { status } = await searchParams;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");

  const { data: teamMembers } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("active", true)
    .order("display_name");

  return (
    <TasksClient
      tasks={tasks ?? []}
      initialStatus={status}
      projects={projects ?? []}
      teamMembers={teamMembers ?? []}
      currentUserId={profile.id}
    />
  );
}
