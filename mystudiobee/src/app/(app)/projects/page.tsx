import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ProjectsClient } from "./projects-client";

const LIFECYCLE_ORDER: Record<string, number> = {
  active: 0,
  on_hold: 1,
  completed: 2,
  cancelled: 3,
};

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const canCreate = profile.role !== "employee";

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, type, status, category, est_hours, created_at, clients(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const sorted = [...(projects ?? [])].sort((a, b) => {
    const lifecycleDiff = (LIFECYCLE_ORDER[a.status] ?? 99) - (LIFECYCLE_ORDER[b.status] ?? 99);
    if (lifecycleDiff !== 0) return lifecycleDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <>
      <DashboardHeader title="Projects">
        {canCreate && (
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Project
          </Link>
        )}
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProjectsClient projects={sorted as never} />
      </div>
    </>
  );
}
