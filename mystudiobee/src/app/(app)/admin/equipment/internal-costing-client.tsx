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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertOverheadItem, setOverheadItemActive, deleteOverheadItem } from "@/lib/actions/equipment";

type CostingType = "purchase" | "recurring" | "per_project";

type InternalCostingItem = {
  id: string;
  name: string;
  cost: number;
  costing_type: CostingType;
  purchase_cost: number | null;
  useful_life_months: number | null;
  active: boolean;
};

const TYPE_LABEL: Record<CostingType, string> = {
  purchase: "One-time purchase (amortized)",
  recurring: "Recurring subscription",
  per_project: "Per-project flat fee",
};

// monthly cost = purchase_cost / useful_life_months, same pattern as
// Equipment's daily-rate auto-fill (equipment-client.tsx deriveRates()).
function deriveMonthlyCost(purchaseCost: string, lifeMonths: string) {
  const cost = parseFloat(purchaseCost);
  const months = parseFloat(lifeMonths);
  if (!cost || !months) return null;
  return Math.round((cost / months) * 100) / 100;
}

const EMPTY_FORM = {
  id: "",
  name: "",
  cost: "",
  costing_type: "recurring" as CostingType,
  purchase_cost: "",
  useful_life_months: "",
};

export function InternalCostingClient({ items }: { items: InternalCostingItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(item: InternalCostingItem) {
    setForm({
      id: item.id,
      name: item.name,
      cost: String(item.cost),
      costing_type: item.costing_type,
      purchase_cost: item.purchase_cost?.toString() ?? "",
      useful_life_months: item.useful_life_months?.toString() ?? "",
    });
    setOpen(true);
  }

  function set(field: keyof typeof EMPTY_FORM, val: string) {
    setForm((f) => {
      const next = { ...f, [field]: val } as typeof f;
      if (next.costing_type === "purchase" && (field === "purchase_cost" || field === "useful_life_months")) {
        const monthly = deriveMonthlyCost(next.purchase_cost, next.useful_life_months);
        if (monthly != null) next.cost = monthly.toString();
      }
      return next;
    });
  }

  async function handleSave() {
    try {
      await upsertOverheadItem({
        id: form.id || undefined,
        name: form.name,
        cost: Number(form.cost),
        costing_type: form.costing_type,
        purchase_cost: form.costing_type === "purchase" && form.purchase_cost ? Number(form.purchase_cost) : null,
        useful_life_months:
          form.costing_type === "purchase" && form.useful_life_months ? Number(form.useful_life_months) : null,
      });
      toast.success(form.id ? "Internal costing item updated" : "Internal costing item added");
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
          Internal Costing
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit internal costing item" : "Add internal costing item"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Adobe Creative Cloud"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Costing type</Label>
                <Select
                  value={form.costing_type}
                  onValueChange={(v) => set("costing_type", v as CostingType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">{TYPE_LABEL.purchase}</SelectItem>
                    <SelectItem value="recurring">{TYPE_LABEL.recurring}</SelectItem>
                    <SelectItem value="per_project">{TYPE_LABEL.per_project}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.costing_type === "purchase" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Purchase cost (₹)</Label>
                    <Input
                      type="number"
                      value={form.purchase_cost}
                      onChange={(e) => set("purchase_cost", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Useful life (months)</Label>
                    <Input
                      type="number"
                      value={form.useful_life_months}
                      onChange={(e) => set("useful_life_months", e.target.value)}
                      placeholder="e.g. 24"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{form.costing_type === "purchase" ? "Monthly cost (₹)" : "Cost (₹)"}</Label>
                <Input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} />
                {form.costing_type === "purchase" && (
                  <p className="text-[11px] text-muted-foreground">Auto-calculated, editable</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!form.name || !form.cost}>
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
            <TableHead>Type</TableHead>
            <TableHead>Effective monthly cost</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!items.length && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No internal costing items yet.
              </TableCell>
            </TableRow>
          )}
          {items.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.name}</TableCell>
              <TableCell>{TYPE_LABEL[o.costing_type]}</TableCell>
              <TableCell>₹{o.cost}</TableCell>
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={async () => {
                    await deleteOverheadItem(o.id);
                    router.refresh();
                  }}
                >
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
