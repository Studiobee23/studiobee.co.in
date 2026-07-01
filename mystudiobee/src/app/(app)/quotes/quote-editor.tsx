"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { computeDocumentTotals } from "@/lib/costing/engine";
import type { LineItem } from "@/lib/costing/types";
import { createQuote, updateDocument, convertDocument, priceLineItem } from "@/lib/actions/documents";

type Client = { id: string; name: string };
type Preset = {
  id: string;
  category: string;
  name: string;
  preset_hours: Record<string, number>;
  default_overhead_ids: string[];
  default_markup_pct: number;
};
type CostRole = { id: string; name: string; hourly_rate: number };
type OverheadItem = { id: string; name: string; cost: number };

export type QuoteDoc = {
  id: string;
  number: string;
  status: string;
  client_id: string | null;
  project_name: string;
  category: string;
  line_items: LineItem[];
  gst_enabled: boolean;
  gst_type: "cgst_sgst" | "igst";
  gst_rate: number;
  discount: number;
  notes: string;
  validity_days: number;
};

export function QuoteEditor({
  clients,
  presets,
  roles,
  overheads,
  canSeeCost,
  doc,
}: {
  clients: Client[];
  presets: Preset[];
  roles: CostRole[];
  overheads: OverheadItem[];
  canSeeCost: boolean;
  doc?: QuoteDoc;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(doc?.client_id ?? "");
  const [projectName, setProjectName] = useState(doc?.project_name ?? "");
  const [category, setCategory] = useState(doc?.category ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>(doc?.line_items ?? []);
  const [gstEnabled, setGstEnabled] = useState(doc?.gst_enabled ?? true);
  const [gstType, setGstType] = useState<"cgst_sgst" | "igst">(doc?.gst_type ?? "cgst_sgst");
  const [gstRate, setGstRate] = useState(doc?.gst_rate ?? 18);
  const [discount, setDiscount] = useState(doc?.discount ?? 0);
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [validityDays, setValidityDays] = useState(doc?.validity_days ?? 15);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showCost, setShowCost] = useState<Record<number, boolean>>({});

  const totals = useMemo(
    () => computeDocumentTotals({ lineItems, discount, gstEnabled, gstRate }),
    [lineItems, discount, gstEnabled, gstRate],
  );

  function removeLineItem(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!clientId || lineItems.length === 0) {
      toast.error("Pick a client and add at least one line item.");
      return;
    }
    setSaving(true);
    const payload = {
      client_id: clientId,
      project_name: projectName,
      category,
      line_items: lineItems,
      subtotal: totals.subtotal,
      gst_enabled: gstEnabled,
      gst_type: gstType,
      gst_rate: gstRate,
      gst_amount: totals.gstAmount,
      discount,
      total: totals.total,
      notes,
      validity_days: validityDays,
    };
    try {
      if (doc) {
        await updateDocument(doc.id, payload);
        toast.success("Quote saved");
        router.refresh();
      } else {
        const id = await createQuote(payload);
        toast.success("Quote created");
        router.push(`/quotes/${id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert() {
    if (!doc) return;
    try {
      const { id } = await convertDocument(doc.id);
      toast.success("Converted to invoice");
      router.push(`/invoices/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to convert");
    }
  }

  async function handleGeneratePdf() {
    if (!doc) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: doc.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate PDF");
      window.open(result.url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Project name</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. branding" />
          </div>
          <div className="space-y-1.5">
            <Label>Validity (days)</Label>
            <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
            Line items
          </h3>
          <AddLineItemDialog
            presets={presets}
            roles={roles}
            overheads={overheads}
            onAdd={(item) => setLineItems((items) => [...items, item])}
          />
        </div>

        {lineItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            No line items yet.
          </p>
        ) : (
          <div className="space-y-2">
            {lineItems.map((li, idx) => (
              <div key={idx} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{li.description}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Qty {li.qty} × ₹{li.rate} = ₹{li.amount}
                    </p>
                  </div>
                  {canSeeCost && li.cost_breakdown && (
                    <button
                      onClick={() => setShowCost((s) => ({ ...s, [idx]: !s[idx] }))}
                      className="text-muted-foreground hover:text-foreground"
                      title="Toggle cost breakdown"
                    >
                      {showCost[idx] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => removeLineItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {canSeeCost && showCost[idx] && li.cost_breakdown && (
                  <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                    {li.cost_breakdown.role_hours.map((rh) => (
                      <p key={rh.role_id}>
                        {rh.role_name_snapshot}: {rh.hours}h × ₹{rh.hourly_rate_snapshot}/hr
                      </p>
                    ))}
                    {li.cost_breakdown.overheads.map((o) => (
                      <p key={o.overhead_id}>
                        {o.name_snapshot}: ₹{o.cost_snapshot}
                      </p>
                    ))}
                    <p>
                      Cost subtotal: ₹{li.cost_breakdown.cost_subtotal} · Markup {li.cost_breakdown.markup_pct}%
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-3 font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
            GST &amp; discount
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>GST enabled</Label>
              <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} />
            </div>
            {gstEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <Select value={gstType} onValueChange={(v) => setGstType(v as "cgst_sgst" | "igst")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cgst_sgst">CGST + SGST</SelectItem>
                    <SelectItem value="igst">IGST</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Discount (₹)</Label>
              <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-3 font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
            Totals
          </h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{totals.subtotal}</span>
            </div>
            {gstEnabled && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({gstRate}%)</span>
                <span>₹{totals.gstAmount}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span>-₹{discount}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-heading font-semibold">
              <span>Total</span>
              <span>₹{totals.total}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <Label>Notes / terms</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1.5" />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : doc ? "Save changes" : "Create quote"}
        </Button>
        {doc && (
          <Button variant="outline" onClick={handleGeneratePdf} disabled={generating}>
            {generating ? "Generating…" : "Generate PDF"}
          </Button>
        )}
        {doc && doc.status !== "cancelled" && (
          <Button variant="outline" onClick={handleConvert}>
            Convert to invoice
          </Button>
        )}
      </div>
    </div>
  );
}

function AddLineItemDialog({
  presets,
  roles,
  overheads,
  onAdd,
}: {
  presets: Preset[];
  roles: CostRole[];
  overheads: OverheadItem[];
  onAdd: (item: LineItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"preset" | "manual">(presets.length > 0 ? "preset" : "manual");
  const [presetId, setPresetId] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState(1);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [overheadIds, setOverheadIds] = useState<string[]>([]);
  const [markup, setMarkup] = useState(0);
  const [manualRate, setManualRate] = useState("");
  const [loading, setLoading] = useState(false);

  function selectPreset(id: string) {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (preset) {
      setDescription(preset.name);
      setHours(Object.fromEntries(Object.entries(preset.preset_hours).map(([k, v]) => [k, String(v)])));
      setOverheadIds(preset.default_overhead_ids);
      setMarkup(preset.default_markup_pct);
    }
  }

  async function handleAdd() {
    if (mode === "manual") {
      const rate = Number(manualRate);
      onAdd({ description, qty, cost_breakdown: null, rate, amount: Math.round(rate * qty * 100) / 100 });
      reset();
      return;
    }
    setLoading(true);
    try {
      const roleHours = Object.entries(hours)
        .filter(([, v]) => Number(v) > 0)
        .map(([role_id, v]) => ({ role_id, hours: Number(v) }));
      const item = await priceLineItem({
        description,
        qty,
        cost: { roleHours, overheadIds, markupPct: markup },
      });
      onAdd(item);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to price line item");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOpen(false);
    setPresetId("");
    setDescription("");
    setQty(1);
    setHours({});
    setOverheadIds([]);
    setMarkup(0);
    setManualRate("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" /> Add line item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add line item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "preset" ? "default" : "outline"}
              onClick={() => setMode("preset")}
            >
              From preset
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => setMode("manual")}
            >
              Manual
            </Button>
          </div>

          {mode === "preset" ? (
            <>
              <div className="space-y-1.5">
                <Label>Preset</Label>
                <Select value={presetId} onValueChange={selectPreset}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.category} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {roles.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Hours per role</Label>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    {roles.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs">{r.name}</span>
                        <Input
                          type="number"
                          className="w-24"
                          value={hours[r.id] ?? ""}
                          onChange={(e) => setHours((h) => ({ ...h, [r.id]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {overheads.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Overheads</Label>
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
                        {o.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Markup (%)</Label>
                  <Input type="number" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rate (₹)</Label>
                  <Input type="number" value={manualRate} onChange={(e) => setManualRate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleAdd}
            disabled={loading || !description || (mode === "manual" ? !manualRate : false)}
          >
            {loading ? "Pricing…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
