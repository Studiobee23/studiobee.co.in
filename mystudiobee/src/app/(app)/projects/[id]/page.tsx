import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectDetailClient } from "./project-detail-client";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: project },
    { data: stages },
    { data: tasks },
    { data: moms },
    { data: documents },
  ] = await Promise.all([
    supabase.from("projects").select("*, clients(id, name)").eq("id", id).single(),
    supabase.from("project_stages").select("*").eq("project_id", id).order("created_at"),
    supabase
      .from("tasks")
      .select("*, profiles!assigned_to(display_name, email)")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("moms")
      .select("*")
      .eq("project_id", id)
      .order("meeting_date", { ascending: false }),
    supabase
      .from("documents")
      .select("id, type, number, status, total, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) notFound();

  return (
    <ProjectDetailClient
      project={project}
      stages={stages ?? []}
      tasks={tasks ?? []}
      moms={moms ?? []}
      documents={documents ?? []}
    />
  );
}
