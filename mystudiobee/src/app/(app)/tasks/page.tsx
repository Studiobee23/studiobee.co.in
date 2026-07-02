import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, projects(name), profiles!assigned_to(display_name, email)")
    .order("due_date", { ascending: true, nullsFirst: false });

  return <TasksClient tasks={tasks ?? []} />;
}
