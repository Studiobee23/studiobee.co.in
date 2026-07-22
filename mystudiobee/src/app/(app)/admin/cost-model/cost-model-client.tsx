"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { upsertCostRole, setCostRoleActive, deleteCostRole } from "@/lib/actions/cost-model";

type CostRole = { id: string; name: string; hourly_rate: number; active: boolean };

export function CostModelClient({ roles }: { roles: CostRole[] }) {
  return <RolesTab roles={roles} />;
}

function RolesTab({ roles }: { roles: CostRole[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CostRole | null>(null);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  function openNew() {
    setEditing(null);
    setName("");
    setRate("");
    setOpen(true);
  }
  function openEdit(role: CostRole) {
    setEditing(role);
    setName(role.name);
    setRate(String(role.hourly_rate));
    setOpen(true);
  }

  async function handleSave() {
    try {
      await upsertCostRole({ id: editing?.id, name, hourly_rate: Number(rate) });
      toast.success(editing ? "Role updated" : "Role added");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
          Cost Roles
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit role" : "Add role"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cinematographer" />
              </div>
              <div className="space-y-1.5">
                <Label>Hourly rate (₹)</Label>
                <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!name || !rate}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Hourly rate</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>₹{r.hourly_rate}/hr</TableCell>
              <TableCell>
                <Switch
                  checked={r.active}
                  onCheckedChange={async (v) => {
                    await setCostRoleActive(r.id, v);
                    router.refresh();
                  }}
                />
              </TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={async () => { await deleteCostRole(r.id); router.refresh(); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

