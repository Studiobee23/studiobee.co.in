import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  on_hold: "bg-yellow-500/10 text-yellow-600",
  completed: "bg-blue-500/10 text-blue-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, type, status, category, est_hours, clients(name)")
    .order("created_at", { ascending: false });

  return (
    <>
      <DashboardHeader title="Projects">
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New Project
        </Link>
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-2">
          {!projects?.length && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No projects yet — create your first one.
            </div>
          )}
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3.5 transition-colors duration-100 hover:bg-muted/40 hover:shadow-card-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-snug">{p.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(p.clients as unknown as { name: string } | null)?.name ?? "No client"}
                  {p.category ? ` · ${p.category}` : ` · ${p.type}`}
                  {p.est_hours ? ` · ${p.est_hours}h est.` : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}
              >
                {p.status.replace("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
