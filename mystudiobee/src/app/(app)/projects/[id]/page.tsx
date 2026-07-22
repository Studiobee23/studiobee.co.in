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
    { data: expenses },
    { data: checklist },
    { data: retainerMonths },
    { data: clients },
    { data: projectVendors },
    { data: projectHires },
    { data: vendors },
    { data: hires },
  ] = await Promise.all([
    supabase.from("projects").select("*, clients(id, name)").eq("id", id).single(),
    supabase.from("project_stages").select("*").eq("project_id", id).order("created_at"),
    supabase.from("tasks").select("*, profiles!assigned_to(display_name, email)").eq("project_id", id).order("created_at"),
    supabase.from("moms").select("*").eq("project_id", id).order("meeting_date", { ascending: false }),
    supabase.from("documents").select("id, type, number, status, total, created_at").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_expenses").select("*").eq("project_id", id).order("expense_date", { ascending: false }).then((r) => r, () => ({ data: [] })),
    supabase.from("delivery_checklists").select("*").eq("project_id", id).order("sort_order").then((r) => r, () => ({ data: [] })),
    supabase.from("retainer_months").select("*").eq("project_id", id).order("month", { ascending: false }).then((r) => r, () => ({ data: [] })),
    supabase.from("clients").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("project_vendors").select("id, notes, equipment_vendors(id, name, overall_rating)").eq("project_id", id).order("created_at"),
    supabase.from("project_hires").select("id, role_on_shoot, notes, external_hires(id, name, overall_rating)").eq("project_id", id).order("created_at"),
    supabase.from("equipment_vendors").select("id, name").eq("active", true).order("overall_rating", { ascending: false, nullsFirst: false }),
    supabase.from("external_hires").select("id, name").eq("active", true).order("overall_rating", { ascending: false, nullsFirst: false }),
  ]);

  if (!project) notFound();

  return (
    <ProjectDetailClient
      project={project}
      stages={stages ?? []}
      tasks={tasks ?? []}
      moms={moms ?? []}
      documents={documents ?? []}
      expenses={(expenses as never[]) ?? []}
      checklist={(checklist as never[]) ?? []}
      retainerMonths={(retainerMonths as never[]) ?? []}
      clients={clients ?? []}
      projectVendors={(projectVendors as never[]) ?? []}
      projectHires={(projectHires as never[]) ?? []}
      vendors={vendors ?? []}
      hires={hires ?? []}
    />
  );
}
