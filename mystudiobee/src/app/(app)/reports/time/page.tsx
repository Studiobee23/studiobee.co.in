import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { formatDuration } from "@/lib/datetime";
import { TimeLogClient } from "./time-log-client";

const DEFAULT_LIMIT = 200;
const PHOTO_URL_TTL_SECONDS = 3600;
const DELETED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function deletedWindowCutoffISO(): string {
  return new Date(Date.now() - DELETED_WINDOW_MS).toISOString();
}

export default async function TimeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/clock");
  const isAdmin = profile.role === "admin";

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
      "id, clocked_in_at, clocked_out_at, notes, employee_id, project_id, clock_in_location_label, clock_out_location_label, clock_in_photo_path, profiles!employee_id(display_name, email), projects(name)"
    )
    .is("deleted_at", null)
    .order("clocked_in_at", { ascending: false });

  if (!showAll) query = query.limit(DEFAULT_LIMIT);

  const { data: rawEntries } = await query;
  const entries = rawEntries ?? [];

  // Batch-sign photo URLs — the bucket is private, so a plain path isn't viewable.
  const photoPaths = entries
    .map((e) => e.clock_in_photo_path)
    .filter((p): p is string => !!p);

  const photoUrlByPath = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("clock-in-selfies")
      .createSignedUrls(photoPaths, PHOTO_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) photoUrlByPath.set(s.path, s.signedUrl);
    }
  }

  const entriesWithPhotoUrl = entries.map((e) => ({
    ...e,
    clock_in_photo_url: e.clock_in_photo_path ? photoUrlByPath.get(e.clock_in_photo_path) ?? null : null,
  }));

  const totalMs = entries
    .filter((e) => e.clocked_out_at)
    .reduce(
      (sum, e) =>
        sum +
        (new Date(e.clocked_out_at!).getTime() - new Date(e.clocked_in_at).getTime()),
      0
    );

  // Admin only: entries soft-deleted within the last 30 days, restorable
  // before purge_expired_bin() permanently removes them.
  let deletedEntries: typeof entries = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("time_entries")
      .select(
        "id, clocked_in_at, clocked_out_at, notes, employee_id, project_id, clock_in_location_label, clock_out_location_label, clock_in_photo_path, profiles!employee_id(display_name, email), projects(name)"
      )
      .not("deleted_at", "is", null)
      .gte("deleted_at", deletedWindowCutoffISO())
      .order("clocked_in_at", { ascending: false });
    deletedEntries = data ?? [];
  }

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
              Showing {entries.length} of {totalCount} entries — view full history
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

        <TimeLogClient
          entries={entriesWithPhotoUrl}
          deletedEntries={deletedEntries}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
