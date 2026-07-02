import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const isEmployee = profile.role === "employee";

  let query = supabase
    .from("tasks")
    .select("*, projects(name), profiles!assigned_to(display_name, email)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (isEmployee) {
    query = query.eq("assigned_to", profile.id);
  }

  const { data: tasks } = await query;

  return <TasksClient tasks={tasks ?? []} />;
}
