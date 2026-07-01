"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { upsertEquipment, setEquipmentActive } from "@/lib/actions/equipment";
import { toast } from "sonner";

type EquipmentItem = {
  id: string;
  name: string;
  description: string;
  purchase_date: string | null;
  purchase_cost: number | null;
  gst_amount: number | null;
  receipt_url: string | null;
  daily_rental_cost: number | null;
  active: boolean;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  description: "",
  purchase_date: "",
  purchase_cost: "",
  gst_amount: "",
  receipt_url: "",
  daily_rental_cost: "",
};

export function EquipmentClient({ items }: { items: EquipmentItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(item: EquipmentItem) {
    setForm({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      purchase_date: item.purchase_date ?? "",
      purchase_cost: item.purchase_cost?.toString() ?? "",
      gst_amount: item.gst_amount?.toString() ?? "",
      receipt_url: item.receipt_url ?? "",
      daily_rental_cost: item.daily_rental_cost?.toString() ?? "",
    });
    setOpen(true);
  }

  function set(field: string, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function save() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      try {
        await upsertEquipment({
          id: form.id || undefined,
          name: form.name,
          description: form.description || undefined,
          purchase_date: form.purchase_date || undefined,
          purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : undefined,
          gst_amount: form.gst_amount ? parseFloat(form.gst_amount) : undefined,
          receipt_url: form.receipt_url || undefined,
          daily_rental_cost: form.daily_rental_cost ? parseFloat(form.daily_rental_cost) : undefined,
        });
        toast.success(form.id ? "Updated" : "Added");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function toggleActive(id: string, active: boolean) {
    startTransition(async () => {
      try {
        await setEquipmentActive(id, active);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <DashboardHeader title="Equipment Inventory">
        <Button size="sm" onClick={openNew}>
          + Add Equipment
        </Button>
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Purchase Cost</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Daily Rental</TableHead>
                <TableHead>Purchase Date</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No equipment yet.
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    {item.purchase_cost != null
                      ? `₹${item.purchase_cost.toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {item.gst_amount != null
                      ? `₹${item.gst_amount.toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {item.daily_rental_cost != null && item.daily_rental_cost > 0
                      ? `₹${item.daily_rental_cost.toLocaleString("en-IN")}/day`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.purchase_date ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.active}
                      onCheckedChange={(v) => toggleActive(item.id, v)}
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description</label>
              <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Purchase Cost (₹)</label>
                <Input type="number" value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">GST Amount (₹)</label>
                <Input type="number" value={form.gst_amount} onChange={(e) => set("gst_amount", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Daily Rental (₹)</label>
                <Input type="number" value={form.daily_rental_cost} onChange={(e) => set("daily_rental_cost", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Purchase Date</label>
                <Input type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Receipt URL</label>
              <Input value={form.receipt_url} onChange={(e) => set("receipt_url", e.target.value)} placeholder="https://..." />
            </div>
            <Button onClick={save} disabled={pending || !form.name.trim()} className="w-full">
              {form.id ? "Update" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
