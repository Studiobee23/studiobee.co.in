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
import { upsertHire, setHireActive } from "@/lib/actions/hires";
import { toast } from "sonner";

type Hire = {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  notes: string;
  rating_skill_quality: number | null;
  rating_reliability: number | null;
  rating_professionalism: number | null;
  rating_price: number | null;
  overall_rating: number | null;
  active: boolean;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  specialty: "",
  phone: "",
  email: "",
  notes: "",
  rating_skill_quality: 0,
  rating_reliability: 0,
  rating_professionalism: 0,
  rating_price: 0,
};

export function HiresClient({ items }: { items: Hire[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(item: Hire) {
    setForm({
      id: item.id,
      name: item.name,
      specialty: item.specialty ?? "",
      phone: item.phone ?? "",
      email: item.email ?? "",
      notes: item.notes ?? "",
      rating_skill_quality: item.rating_skill_quality ?? 0,
      rating_reliability: item.rating_reliability ?? 0,
      rating_professionalism: item.rating_professionalism ?? 0,
      rating_price: item.rating_price ?? 0,
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
        await upsertHire({
          id: form.id || undefined,
          name: form.name,
          specialty: form.specialty || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          notes: form.notes || undefined,
          rating_skill_quality: form.rating_skill_quality || undefined,
          rating_reliability: form.rating_reliability || undefined,
          rating_professionalism: form.rating_professionalism || undefined,
          rating_price: form.rating_price || undefined,
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
        await setHireActive(id, active);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <DashboardHeader title="External Hires">
        <Button size="sm" onClick={openNew}>
          + Add Hire
        </Button>
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead>Reliability</TableHead>
                <TableHead>Professionalism</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No external hires yet.
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.specialty || "—"}</TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_skill_quality} />
                  </TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_reliability} />
                  </TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_professionalism} />
                  </TableCell>
                  <TableCell>
                    <StarRatingDisplay value={item.rating_price} />
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
            <DialogTitle>{form.id ? "Edit Hire" : "Add Hire"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Specialty</label>
                <Input
                  value={form.specialty}
                  onChange={(e) => set("specialty", e.target.value)}
                  placeholder="e.g. Camera Operator"
                />
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
                <label className="text-xs font-medium">Skill / Work Quality</label>
                <StarRatingInput
                  value={form.rating_skill_quality}
                  onChange={(v) => set("rating_skill_quality", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Reliability</label>
                <StarRatingInput
                  value={form.rating_reliability}
                  onChange={(v) => set("rating_reliability", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Professionalism</label>
                <StarRatingInput
                  value={form.rating_professionalism}
                  onChange={(v) => set("rating_professionalism", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Price</label>
                <StarRatingInput value={form.rating_price} onChange={(v) => set("rating_price", v)} />
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
