"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";
import { deleteTimeEntry, restoreTimeEntry } from "@/lib/actions/time";
import { formatDateLongIST, formatTimeIST, formatDuration } from "@/lib/datetime";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Entry = {
  id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  notes: string | null;
  employee_id: string;
  project_id: string | null;
  clock_in_location_label: string | null;
  clock_out_location_label: string | null;
  clock_in_photo_path: string | null;
  clock_in_photo_url?: string | null;
  profiles: unknown;
  projects: unknown;
};

function empName(profiles: unknown): string {
  const p = profiles as { display_name?: string; email?: string } | null;
  return p?.display_name || p?.email || "—";
}

function projName(projects: unknown): string {
  const p = projects as { name?: string } | null;
  return p?.name ?? "—";
}

export function TimeLogClient({
  entries,
  deletedEntries,
  isAdmin,
}: {
  entries: Entry[];
  deletedEntries: Entry[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleDelete(entry: Entry) {
    if (!window.confirm(`Delete this time entry for ${empName(entry.profiles)}? It can be restored for 30 days.`)) {
      return;
    }
    setPendingId(entry.id);
    startTransition(async () => {
      try {
        await deleteTimeEntry(entry.id);
        toast.success("Entry deleted");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleRestore(entry: Entry) {
    setPendingId(entry.id);
    startTransition(async () => {
      try {
        await restoreTimeEntry(entry.id);
        toast.success("Entry restored");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  const columns = [
    "Photo", "Employee", "Project", "Date", "In", "Out", "Duration", "In Location", "Out Location", "Notes",
  ];
  if (isAdmin) columns.push("");

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No time entries yet.
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const durationMs = e.clocked_out_at
                ? new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime()
                : null;
              return (
                <tr key={e.id} className="bg-card hover:bg-muted/30">
                  <td className="px-4 py-3">
                    {e.clock_in_photo_url ? (
                      <a href={e.clock_in_photo_url} target="_blank" rel="noreferrer">
                        <Avatar size="lg">
                          <AvatarImage src={e.clock_in_photo_url} alt={`${empName(e.profiles)} clock-in selfie`} />
                          <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                      </a>
                    ) : (
                      <Avatar size="lg">
                        <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                      </Avatar>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-[13px]">{empName(e.profiles)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{projName(e.projects)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDateLongIST(e.clocked_in_at)}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">{formatTimeIST(e.clocked_in_at)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {e.clocked_out_at ? formatTimeIST(e.clocked_out_at) : <span className="text-primary font-medium">Active</span>}
                  </td>
                  <td className="px-4 py-3 font-heading font-semibold text-xs tabular-nums">
                    {durationMs !== null ? formatDuration(durationMs) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                    {e.clock_in_location_label ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                    {e.clock_out_location_label ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                    {e.notes ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(e)}
                        disabled={pending && pendingId === e.id}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recently deleted (admin only) */}
      {isAdmin && deletedEntries.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" /> Recently deleted — restorable for 30 days
          </div>
          <div className="divide-y divide-border">
            {deletedEntries.map((e) => (
              <div key={e.id} className="flex items-center gap-4 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {empName(e.profiles)} · {projName(e.projects)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDateLongIST(e.clocked_in_at)} · {formatTimeIST(e.clocked_in_at)}
                    {e.clocked_out_at ? ` – ${formatTimeIST(e.clocked_out_at)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(e)}
                  disabled={pending && pendingId === e.id}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
