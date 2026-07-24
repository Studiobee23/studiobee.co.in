import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default async function HoursReportPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, est_hours, status, clients(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: docs } = await supabase
    .from("documents")
    .select("project_id, line_items")
    .not("project_id", "is", null)
    .is("deleted_at", null);

  const consumedByProject: Record<string, number> = {};
  for (const doc of docs ?? []) {
    if (!doc.project_id) continue;
    const items = (doc.line_items ?? []) as Array<{
      cost_breakdown: { role_hours?: Array<{ hours: number }> } | null;
    }>;
    for (const item of items) {
      if (!item.cost_breakdown?.role_hours) continue;
      const hrs = item.cost_breakdown.role_hours.reduce(
        (s, r) => s + r.hours,
        0
      );
      consumedByProject[doc.project_id] =
        (consumedByProject[doc.project_id] ?? 0) + hrs;
    }
  }

  return (
    <>
      <DashboardHeader title="Hours Report" backHref="/reports" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Project", "Client", "Est. Hours", "Consumed Hours", "Remaining", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!projects?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No projects yet.
                  </td>
                </tr>
              )}
              {(projects ?? []).map((p) => {
                const est = p.est_hours ?? 0;
                const consumed = consumedByProject[p.id] ?? 0;
                const remaining = est - consumed;
                const overBudget = est > 0 && remaining < 0;
                return (
                  <tr key={p.id} className="bg-card hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(p.clients as unknown as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">{est > 0 ? `${est}h` : "—"}</td>
                    <td className="px-4 py-3">{consumed > 0 ? `${consumed}h` : "—"}</td>
                    <td
                      className={`px-4 py-3 font-medium ${overBudget ? "text-red-600" : ""}`}
                    >
                      {est > 0 ? `${remaining}h` : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {p.status.replace("_", " ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
