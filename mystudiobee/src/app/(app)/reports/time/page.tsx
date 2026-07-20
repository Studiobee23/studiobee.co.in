import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { DashboardHeader } from "@/components/layout/dashboard-header";

const DEFAULT_LIMIT = 200;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function TimeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/clock");

  const { all } = await searchParams;
  const showAll = all === "1";

  const supabase = await createClient();

  const { count: totalCount } = await supabase
    .from("time_entries")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  let query = supabase
    .from("time_entries")
    .select(
      "id, clocked_in_at, clocked_out_at, notes, employee_id, project_id, location_label, profiles!employee_id(display_name, email), projects(name)"
    )
    .is("deleted_at", null)
    .order("clocked_in_at", { ascending: false });

  if (!showAll) query = query.limit(DEFAULT_LIMIT);

  const { data: entries } = await query;

  const totalMs = (entries ?? [])
    .filter((e) => e.clocked_out_at)
    .reduce(
      (sum, e) =>
        sum +
        (new Date(e.clocked_out_at!).getTime() -
          new Date(e.clocked_in_at).getTime()),
      0
    );

  return (
    <>
      <DashboardHeader title="Time Log" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-card inline-flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {showAll ? "Total logged (all time)" : `Total logged (last ${DEFAULT_LIMIT})`}
            </p>
            <p className="font-heading text-2xl font-bold">{formatDuration(totalMs)}</p>
          </div>
          {!showAll && (totalCount ?? 0) > DEFAULT_LIMIT && (
            <Link
              href="/reports/time?all=1"
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Showing {entries?.length ?? 0} of {totalCount} entries — view full history
            </Link>
          )}
          {showAll && (
            <Link
              href="/reports/time"
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Showing all {totalCount} entries — view recent only
            </Link>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Employee", "Project", "Date", "In", "Out", "Duration", "Location", "Notes"].map((h) => (
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
              {!(entries ?? []).length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No time entries yet.
                  </td>
                </tr>
              )}
              {(entries ?? []).map((e) => {
                const emp = e.profiles as unknown as { display_name: string; email: string } | null;
                const proj = e.projects as unknown as { name: string } | null;
                const durationMs = e.clocked_out_at
                  ? new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime()
                  : null;
                const inDate = new Date(e.clocked_in_at);
                return (
                  <tr key={e.id} className="bg-card hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-[13px]">
                      {emp?.display_name || emp?.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {proj?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {inDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {inDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                      {e.clocked_out_at
                        ? new Date(e.clocked_out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
                        : <span className="text-primary font-medium">Active</span>}
                    </td>
                    <td className="px-4 py-3 font-heading font-semibold text-xs tabular-nums">
                      {durationMs !== null ? formatDuration(durationMs) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {e.location_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                      {e.notes ?? "—"}
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
