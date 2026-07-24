"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logPointEvent, getPointEvents, updatePointEvent, deletePointEvent } from "@/lib/actions/performance";
import type { EmployeeScore, PointReason, PointEvent } from "@/lib/performance/types";
import type { Role } from "@/lib/profile";

export function TeamScores({
  scores,
  reasons,
  role,
  profileId,
}: {
  scores: EmployeeScore[];
  reasons: PointReason[];
  role: Role;
  profileId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<EmployeeScore | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<EmployeeScore | null>(null);
  const [history, setHistory] = useState<PointEvent[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PointEvent | null>(null);
  const [editNote, setEditNote] = useState("");

  const activeReasons = reasons.filter((r) => r.active);

  function canLogFor(emp: EmployeeScore) {
    return role === "admin" || role === "super_admin" || (role === "manager" && emp.manager_id === profileId);
  }

  function canModify(e: PointEvent) {
    return role === "admin" || role === "super_admin" || e.logged_by === profileId;
  }

  async function refreshHistory() {
    if (!historyTarget) return;
    const events = await getPointEvents(historyTarget.id);
    setHistory(events);
  }

  function openEditNote(e: PointEvent) {
    setEditTarget(e);
    setEditNote(e.note);
    setEditOpen(true);
  }

  async function handleEditNote() {
    if (!editTarget) return;
    try {
      await updatePointEvent(editTarget.id, editNote);
      toast.success("Note updated");
      setEditOpen(false);
      await refreshHistory();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDeleteEvent(e: PointEvent) {
    if (!window.confirm("Delete this point event? This cannot be undone.")) return;
    try {
      await deletePointEvent(e.id);
      toast.success("Event deleted");
      await refreshHistory();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function openLog(emp: EmployeeScore) {
    setLogTarget(emp);
    setReasonId(activeReasons[0]?.id ?? "");
    setNote("");
    setLogOpen(true);
  }

  async function handleLog() {
    if (!logTarget) return;
    startTransition(async () => {
      try {
        await logPointEvent({ employeeId: logTarget.id, reasonId, note: note || undefined });
        toast.success("Point event logged");
        setLogOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to log event");
      }
    });
  }

  async function openHistory(emp: EmployeeScore) {
    setHistoryTarget(emp);
    setHistoryOpen(true);
    const events = await getPointEvents(emp.id);
    setHistory(events);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Score</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell className="font-medium">{emp.display_name || "—"}</TableCell>
              <TableCell className="text-muted-foreground">{emp.email}</TableCell>
              <TableCell className="capitalize text-muted-foreground">{emp.role}</TableCell>
              <TableCell className={emp.score < 0 ? "text-destructive" : ""}>{emp.score}</TableCell>
              <TableCell className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => openHistory(emp)}>
                  History
                </Button>
                {canLogFor(emp) && (
                  <Button size="sm" onClick={() => openLog(emp)}>
                    Log event
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {scores.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                No team members yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log point event — {logTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeReasons.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label} ({r.points > 0 ? `+${r.points}` : r.points})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleLog} disabled={!reasonId || pending}>
              {pending ? "Saving…" : "Log event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>History — {historyTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{e.reason_label}</TableCell>
                  <TableCell className={e.points < 0 ? "text-destructive" : "text-emerald-600"}>
                    {e.points > 0 ? `+${e.points}` : e.points}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.note || "—"}</TableCell>
                  <TableCell className="flex gap-2 justify-end">
                    {canModify(e) && (
                      <>
                        <button onClick={() => openEditNote(e)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteEvent(e)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No point events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleEditNote}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
