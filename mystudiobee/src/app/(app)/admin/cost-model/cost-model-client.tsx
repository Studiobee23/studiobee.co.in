"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  upsertCostRole,
  setCostRoleActive,
  deleteCostRole,
  upsertOverheadItem,
  setOverheadItemActive,
  deleteOverheadItem,
} from "@/lib/actions/cost-model";

type CostRole = { id: string; name: string; hourly_rate: number; active: boolean };
type OverheadItem = { id: string; name: string; cost: number; type: "per-project" | "monthly"; active: boolean };

export function CostModelClient({
  roles,
  overheads,
}: {
  roles: CostRole[];
  overheads: OverheadItem[];
}) {
  return (
    <Tabs defaultValue="roles">
      <TabsList>
        <TabsTrigger value="roles">Roles</TabsTrigger>
        <TabsTrigger value="overheads">Overheads</TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="mt-4">
        <RolesTab roles={roles} />
      </TabsContent>
      <TabsContent value="overheads" className="mt-4">
        <OverheadsTab overheads={overheads} />
      </TabsContent>
    </Tabs>
  );
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

function OverheadsTab({ overheads }: { overheads: OverheadItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OverheadItem | null>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [type, setType] = useState<"per-project" | "monthly">("per-project");

  function openNew() {
    setEditing(null);
    setName("");
    setCost("");
    setType("per-project");
    setOpen(true);
  }
  function openEdit(item: OverheadItem) {
    setEditing(item);
    setName(item.name);
    setCost(String(item.cost));
    setType(item.type);
    setOpen(true);
  }

  async function handleSave() {
    try {
      await upsertOverheadItem({ id: editing?.id, name, cost: Number(cost), type });
      toast.success(editing ? "Overhead updated" : "Overhead added");
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
          Overhead Items
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add overhead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit overhead" : "Add overhead"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camera rental" />
              </div>
              <div className="space-y-1.5">
                <Label>Cost (₹)</Label>
                <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "per-project" | "monthly")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per-project">Per-project</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!name || !cost}>
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
            <TableHead>Cost</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {overheads.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.name}</TableCell>
              <TableCell>₹{o.cost}</TableCell>
              <TableCell className="capitalize">{o.type}</TableCell>
              <TableCell>
                <Switch
                  checked={o.active}
                  onCheckedChange={async (v) => {
                    await setOverheadItemActive(o.id, v);
                    router.refresh();
                  }}
                />
              </TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(o)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={async () => { await deleteOverheadItem(o.id); router.refresh(); }}>
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
