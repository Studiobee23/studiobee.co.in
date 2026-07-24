"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertPointReason, setPointReasonActive } from "@/lib/actions/performance";
import type { PointReason } from "@/lib/performance/types";

export function PointReasonsTab({ reasons }: { reasons: PointReason[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PointReason | null>(null);
  const [label, setLabel] = useState("");
  const [points, setPoints] = useState("");

  function openNew() {
    setEditing(null);
    setLabel("");
    setPoints("");
    setOpen(true);
  }
  function openEdit(reason: PointReason) {
    setEditing(reason);
    setLabel(reason.label);
    setPoints(String(reason.points));
    setOpen(true);
  }

  async function handleSave() {
    try {
      await upsertPointReason({ id: editing?.id, label, points: Number(points) });
      toast.success(editing ? "Reason updated" : "Reason added");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">Point Reasons</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add reason
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit reason" : "Add reason"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Late arrival" />
              </div>
              <div className="space-y-1.5">
                <Label>Points (negative for penalties)</Label>
                <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="-2" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!label || !points}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Points</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {reasons.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.label}</TableCell>
              <TableCell className={r.points < 0 ? "text-destructive" : "text-emerald-600"}>
                {r.points > 0 ? `+${r.points}` : r.points}
              </TableCell>
              <TableCell>
                <Switch
                  checked={r.active}
                  onCheckedChange={async (v) => {
                    try {
                      await setPointReasonActive(r.id, v);
                      router.refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to update");
                    }
                  }}
                />
              </TableCell>
              <TableCell>
                <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TableCell>
            </TableRow>
          ))}
          {reasons.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                No point reasons yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
