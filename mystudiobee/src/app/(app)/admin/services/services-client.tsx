"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertServicePreset, deleteServicePreset } from "@/lib/actions/cost-model";

type CostRole = { id: string; name: string; hourly_rate: number; active: boolean };
type OverheadItem = {
  id: string;
  name: string;
  cost: number;
  costing_type: "purchase" | "recurring" | "per_project";
  active: boolean;
};
type ServicePreset = {
  id: string;
  category: string;
  name: string;
  preset_hours: Record<string, number>;
  default_overhead_ids: string[];
  default_markup_pct: number;
};

export function ServicesClient({
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
      toast.success(editing ? "Service updated" : "Service added");
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
          Services
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit service" : "Add service"}</DialogTitle>
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
                <Label>Default internal costing</Label>
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
