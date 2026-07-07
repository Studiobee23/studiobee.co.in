"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Timer, Play, Square, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { clockIn, clockOut } from "@/lib/actions/time";

type Project = { id: string; name: string };
type ActiveEntry = {
  id: string;
  clocked_in_at: string;
  project_id: string | null;
  notes: string | null;
  projects: unknown;
  location_label: string | null;
};
type RecentEntry = {
  id: string;
  clocked_in_at: string;
  clocked_out_at: string;
  notes: string | null;
  project_id: string | null;
  projects: unknown;
  location_label: string | null;
};

function getCurrentLocation(): Promise<{ latitude?: number; longitude?: number; location_label?: string }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          location_label: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        }),
      () => resolve({}),
      { timeout: 5000, maximumAge: 60_000 }
    );
  });
}

function projectName(projects: unknown): string {
  const p = projects as { name: string } | null;
  return p?.name ?? "No project";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function ClockClient({
  activeEntry,
  recentEntries,
  projects,
}: {
  profile: { id: string; display_name: string };
  activeEntry: ActiveEntry | null;
  recentEntries: RecentEntry[];
  projects: Project[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const [selectedProject, setSelectedProject] = useState("");
  const [notes, setNotes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live timer when clocked in
  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const start = new Date(activeEntry.clocked_in_at).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeEntry]);

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const handleClockIn = () =>
    run(async () => {
      const location = await getCurrentLocation();
      await clockIn({ project_id: selectedProject || undefined, notes: notes || undefined, ...location });
    });

  const handleClockOut = () =>
    run(() => clockOut(activeEntry!.id));

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-sm space-y-5">

        {/* Main clock card */}
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elevated">
          <div className="mb-2 flex items-center justify-center gap-2 text-muted-foreground">
            <Timer className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">
              {activeEntry ? "Clocked In" : "Ready"}
            </span>
          </div>

          {/* Live timer */}
          <p className="font-heading text-5xl font-bold tabular-nums tracking-tight text-foreground">
            {activeEntry ? formatDuration(elapsed) : "00:00:00"}
          </p>

          {activeEntry && (
            <p className="mt-2 text-xs text-muted-foreground">
              Since {formatTime(activeEntry.clocked_in_at)} · {projectName(activeEntry.projects)}
              {activeEntry.location_label ? ` · 📍 ${activeEntry.location_label}` : ""}
            </p>
          )}

          {/* Project + notes (only when not clocked in) */}
          {!activeEntry && (
            <div className="mt-5 space-y-2 text-left">
              <div className="relative">
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {/* Action button */}
          <button
            onClick={activeEntry ? handleClockOut : handleClockIn}
            disabled={isPending}
            className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold transition-opacity duration-150 disabled:opacity-60 ${
              activeEntry
                ? "bg-red-500 text-white hover:bg-red-600 active:bg-red-700"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
            }`}
          >
            {activeEntry ? (
              <><Square className="h-5 w-5 fill-current" /> Clock Out</>
            ) : (
              <><Play className="h-5 w-5 fill-current" /> Clock In</>
            )}
          </button>
        </div>

        {/* Recent entries */}
        {recentEntries.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Recent Sessions
            </p>
            <div className="space-y-2">
              {recentEntries.map((e) => {
                const durationMs =
                  new Date(e.clocked_out_at).getTime() -
                  new Date(e.clocked_in_at).getTime();
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium">
                        {projectName(e.projects)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(e.clocked_in_at)} · {formatTime(e.clocked_in_at)} – {formatTime(e.clocked_out_at)}
                        {e.location_label ? ` · 📍 ${e.location_label}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-heading text-sm font-semibold tabular-nums text-foreground">
                      {formatDuration(durationMs)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
