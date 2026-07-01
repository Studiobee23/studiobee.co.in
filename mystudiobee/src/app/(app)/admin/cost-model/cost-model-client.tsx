"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
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
  upsertOverheadItem,
  setOverheadItemActive,
  upsertServicePreset,
  deleteServicePreset,
} from "@/lib/actions/cost-model";

type CostRole = { id: string; name: string; hourly_rate: number; active: boolean };
type OverheadItem = { id: string; name: string; cost: number; type: "per-project" | "monthly"; active: boolean };
type ServicePreset = {
  id: string;
  category: string;
  name: string;
  preset_hours: Record<string, number>;
  default_overhead_ids: string[];
  default_markup_pct: number;
};

export function CostModelClient({
  roles,
  overheads,
  presets,
}: {
  roles: CostRole[];
  overheads: OverheadItem[];
  presets: ServicePreset[];
}) {
  return (
    <Tabs defaultValue="roles">
      <TabsList>
        <TabsTrigger value="roles">Roles</TabsTrigger>
        <TabsTrigger value="overheads">Overheads</TabsTrigger>
        <TabsTrigger value="presets">Presets</TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="mt-4">
        <RolesTab roles={roles} />
      </TabsContent>
      <TabsContent value="overheads" className="mt-4">
        <OverheadsTab overheads={overheads} />
      </TabsContent>
      <TabsContent value="presets" className="mt-4">
        <PresetsTab presets={presets} roles={roles} overheads={overheads} />
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
              <TableCell>
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" />
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
              <TableCell>
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(o)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PresetsTab({
  presets,
  roles,
  overheads,
}: {
  presets: ServicePreset[];
  roles: CostRole[];
  overheads: OverheadItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServicePreset | null>(null);
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [hours, setHours] = useState<Record<string, string>>({});
  const [overheadIds, setOverheadIds] = useState<string[]>([]);
  const [markup, setMarkup] = useState("0");

  function openNew() {
    setEditing(null);
    setCategory("");
    setName("");
    setHours({});
    setOverheadIds([]);
    setMarkup("0");
    setOpen(true);
  }
  function openEdit(preset: ServicePreset) {
    setEditing(preset);
    setCategory(preset.category);
    setName(preset.name);
    setHours(Object.fromEntries(Object.entries(preset.preset_hours).map(([k, v]) => [k, String(v)])));
    setOverheadIds(preset.default_overhead_ids);
    setMarkup(String(preset.default_markup_pct));
    setOpen(true);
  }

  async function handleSave() {
    const preset_hours: Record<string, number> = {};
    for (const [roleId, val] of Object.entries(hours)) {
      const n = Number(val);
      if (val && n > 0) preset_hours[roleId] = n;
    }
    try {
      await upsertServicePreset({
        id: editing?.id,
        category,
        name,
        preset_hours,
        default_overhead_ids: overheadIds,
        default_markup_pct: Number(markup),
      });
      toast.success(editing ? "Preset updated" : "Preset added");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete(id: string) {
    await deleteServicePreset(id);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
          Service Presets
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add preset
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit preset" : "Add preset"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="cinematography" />
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="1-Day Shoot + Edit" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Role hours</Label>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {roles.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <span className="text-xs">{r.name}</span>
                      <Input
                        type="number"
                        className="w-24"
                        value={hours[r.id] ?? ""}
                        onChange={(e) => setHours((h) => ({ ...h, [r.id]: e.target.value }))}
                        placeholder="hrs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Default overheads</Label>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {overheads.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={overheadIds.includes(o.id)}
                        onChange={(e) =>
                          setOverheadIds((ids) =>
                            e.target.checked ? [...ids, o.id] : ids.filter((id) => id !== o.id),
                          )
                        }
                      />
                      {o.name} (₹{o.cost})
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Default markup (%)</Label>
                <Input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!category || !name}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Markup</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {presets.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="capitalize">{p.category}</TableCell>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.default_markup_pct}%</TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(p.id)}>
                  ×
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
