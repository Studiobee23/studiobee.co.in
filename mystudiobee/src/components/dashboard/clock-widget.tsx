"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Timer, Square, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { clockOut, pauseTimeEntry, resumeTimeEntry } from "@/lib/actions/time";
import { getCurrentLocation } from "@/lib/clock/geolocation";
import { formatTimeIST, formatDuration, workedMs } from "@/lib/datetime";

type ActiveEntry = {
  id: string;
  clocked_in_at: string;
  projects: unknown;
  paused_at: string | null;
  paused_seconds: number;
} | null;

function projectName(projects: unknown): string {
  const p = projects as { name: string } | null;
  return p?.name ?? "No project";
}

export function DashboardClockWidget({ activeEntry }: { activeEntry: ActiveEntry }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeEntry) {
      // elapsed isn't rendered while idle, so nothing to reset — just stop the tick
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const tick = () => setElapsed(workedMs(activeEntry));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeEntry]);

  const isPaused = Boolean(activeEntry?.paused_at);

  function handleClockOut() {
    startTransition(async () => {
      try {
        const location = await getCurrentLocation();
        if (!location) throw new Error("Location access is required to clock out. Please enable location and try again.");
        await clockOut(activeEntry!.id, location);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to clock out");
      }
    });
  }

  function handleTogglePause() {
    startTransition(async () => {
      try {
        if (isPaused) await resumeTimeEntry(activeEntry!.id);
        else await pauseTimeEntry(activeEntry!.id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update pause state");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isPaused ? "bg-amber-400/10 text-amber-500" : activeEntry ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <Timer className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${isPaused ? "text-amber-500" : "text-muted-foreground"}`}>
            {isPaused ? "Paused" : activeEntry ? "Clocked In" : "Not Clocked In"}
          </p>
          {activeEntry ? (
            <p className="flex flex-wrap items-baseline gap-x-2 font-heading text-lg font-semibold tabular-nums tracking-tight">
              {formatDuration(elapsed)}
              <span className="text-xs font-normal text-muted-foreground">
                since {formatTimeIST(activeEntry.clocked_in_at)} · {projectName(activeEntry.projects)}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Clock in to start tracking your time</p>
          )}
        </div>
      </div>
      {activeEntry ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleTogglePause}
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              isPaused
                ? "bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700"
                : "bg-amber-400 text-amber-950 hover:bg-amber-500 active:bg-amber-600"
            }`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={handleClockOut}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 active:bg-red-700 disabled:opacity-60"
          >
            <Square className="h-3.5 w-3.5 fill-current" /> {isPending ? "Clocking out…" : "Clock Out"}
          </button>
        </div>
      ) : (
        <Link
          href="/time-performance?tab=clock"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Clock In
        </Link>
      )}
    </div>
  );
}
