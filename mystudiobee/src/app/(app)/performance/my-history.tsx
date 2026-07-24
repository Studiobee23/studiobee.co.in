"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PointEvent } from "@/lib/performance/types";

export function MyHistory({ events }: { events: PointEvent[] }) {
  const score = events.reduce((sum, e) => sum + e.points, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-card inline-flex flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your score</p>
        <p className="font-heading text-2xl font-bold">{score}</p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{e.reason_label}</TableCell>
                <TableCell className={e.points < 0 ? "text-destructive" : "text-emerald-600"}>
                  {e.points > 0 ? `+${e.points}` : e.points}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.note || "—"}</TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  No point events yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
