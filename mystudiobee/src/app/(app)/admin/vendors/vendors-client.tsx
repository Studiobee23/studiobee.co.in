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
import { StarRatingDisplay, StarRatingInput } from "@/components/ui/star-rating";
import { upsertVendor, setVendorActive } from "@/lib/actions/vendors";
import { toast } from "sonner";

type Vendor = {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
  rating_equipment_quality: number | null;
  rating_price: number | null;
  rating_vendor_quality: number | null;
  overall_rating: number | null;
  active: boolean;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  notes: "",
  rating_equipment_quality: 0,
  rating_price: 0,
  rating_vendor_quality: 0,
};

export function VendorsClient({ items }: { items: Vendor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(item: Vendor) {
    setForm({
      id: item.id,
      name: item.name,
      contact_name: item.contact_name ?? "",
      phone: item.phone ?? "",
      email: item.email ?? "",
      notes: item.notes ?? "",
      rating_equipment_quality: item.rating_equipment_quality ?? 0,
      rating_price: item.rating_price ?? 0,
      rating_vendor_quality: item.rating_vendor_quality ?? 0,
    });
    setOpen(true);
  }

  function set<K extends keyof typeof EMPTY_FORM>(field: K, val: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function save() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      try {
        await upsertVendor({
          id: form.id || undefined,
          name: form.name,
          contact_name: form.contact_name || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          notes: form.notes || undefined,
          rating_equipment_quality: form.rating_equipment_quality || undefined,
          rating_price: form.rating_price || undefined,
          rating_vendor_quality: form.rating_vendor_quality || undefined,
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
        await setVendorActive(id, active);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <DashboardHeader title="Equipment Vendors">
        <Button size="sm" onClick={openNew}>
          + Add Vendor
        </Button>
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Equipment Quality</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Vendor Quality</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No vendors yet.
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.name}
                    {item.contact_name && (
                      <p className="text-xs text-muted-foreground">{item.contact_name}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_equipment_quality} />
                  </TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_price} />
                  </TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_vendor_quality} />
                  </TableCell>
                  <TableCell className="font-semibold">
                    <StarRatingDisplay value={item.overall_rating} showValue />
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
            <DialogTitle>{form.id ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Contact Name</label>
                <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Phone</label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notes</label>
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Equipment Quality</label>
                <StarRatingInput
                  value={form.rating_equipment_quality}
                  onChange={(v) => set("rating_equipment_quality", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Price</label>
                <StarRatingInput value={form.rating_price} onChange={(v) => set("rating_price", v)} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Vendor Quality</label>
                <StarRatingInput
                  value={form.rating_vendor_quality}
                  onChange={(v) => set("rating_vendor_quality", v)}
                />
              </div>
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
