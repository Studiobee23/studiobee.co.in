export const IST_TIMEZONE = "Asia/Kolkata";

export function formatTimeIST(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: IST_TIMEZONE,
  });
}

export function formatDateIST(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: IST_TIMEZONE,
  });
}

export function formatDateLongIST(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST_TIMEZONE,
  });
}

/** Worked duration for a time entry, excluding paused time (including an in-progress pause). */
export function workedMs(entry: {
  clocked_in_at: string;
  clocked_out_at?: string | null;
  paused_seconds?: number | null;
  paused_at?: string | null;
}): number {
  const start = new Date(entry.clocked_in_at).getTime();
  const end = entry.clocked_out_at ? new Date(entry.clocked_out_at).getTime() : Date.now();
  let pausedMs = (entry.paused_seconds ?? 0) * 1000;
  if (entry.paused_at) pausedMs += Date.now() - new Date(entry.paused_at).getTime();
  return Math.max(0, end - start - pausedMs);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
