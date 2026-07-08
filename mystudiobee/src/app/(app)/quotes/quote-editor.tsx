"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, EyeOff, LayoutList, AlignLeft } from "lucide-react";
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
import {
  computeProfitSplit,
  sumLaborCost,
  sumDirectCost,
} from "@/lib/profit-split/engine";
import type { ProfitSplitSettings } from "@/lib/profit-split/engine";
import type { LineItem } from "@/lib/costing/types";
import { createQuote, updateDocument, convertDocument, priceLineItem, deleteDocument, updateDocumentStatus } from "@/lib/actions/documents";

type Client = { id: string; name: string };
type EquipmentItem = { id: string; name: string; daily_rental_cost: number | null; weekly_rental_cost: number | null };

/** Weekly rate (if set) is applied to full weeks; remainder days bill at the daily rate. */
function equipmentBaseCost(eq: EquipmentItem, days: number): number {
  if (eq.weekly_rental_cost && days >= 7) {
    const weeks = Math.floor(days / 7);
    const remDays = days % 7;
    return weeks * eq.weekly_rental_cost + remDays * (eq.daily_rental_cost ?? 0);
  }
  return (eq.daily_rental_cost ?? 0) * days;
}
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
type TeamMember = { id: string; display_name: string; email: string; role: string };

export type QuoteDoc = {
  id: string;
  number: string;
  status: string;
  client_id: string | null;
  project_id?: string | null;
  project_name: string;
  category: string;
  line_items: LineItem[];
  gst_enabled: boolean;
  gst_type: "cgst_sgst" | "igst";
  gst_rate: number;
  discount: number;
  discount_type?: "flat" | "percent";
  notes: string;
  validity_days: number;
  executor_id?: string | null;
  manager_id?: string | null;
  client_handler_id?: string | null;
};

const STATUS_OPTIONS: Record<"quote" | "invoice" | "receipt", string[]> = {
  quote: ["draft", "sent", "accepted", "cancelled"],
  invoice: ["draft", "sent", "paid", "cancelled"],
  receipt: ["paid", "cancelled"],
};

const NEXT_DOC_TYPE: Record<string, string> = { quote: "invoice", invoice: "receipt" };

// Matches the profit_split_settings categories exactly — category here is a lookup
// key (computeProfitSplit does `settings.category === category`), so it can't be free
// text without silently breaking the profit-split match on a typo.
const CATEGORIES = ["video", "web", "design", "retainer"] as const;

type ProjectOption = { id: string; name: string; client_id: string | null };

export function QuoteEditor({
  clients,
  presets,
  roles,
  overheads,
  canSeeCost,
  doc,
  docType = "quote",
  teamMembers = [],
  splitSettings = [],
  equipmentItems = [],
  projects = [],
}: {
  clients: Client[];
  presets: Preset[];
  roles: CostRole[];
  overheads: OverheadItem[];
  canSeeCost: boolean;
  doc?: QuoteDoc;
  docType?: "quote" | "invoice" | "receipt";
  teamMembers?: TeamMember[];
  splitSettings?: ProfitSplitSettings[];
  equipmentItems?: EquipmentItem[];
  projects?: ProjectOption[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(doc?.client_id ?? "");
  const [projectId, setProjectId] = useState(doc?.project_id ?? "");
  const [projectName, setProjectName] = useState(doc?.project_name ?? "");
  const [category, setCategory] = useState(doc?.category ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>(doc?.line_items ?? []);
  const [gstEnabled, setGstEnabled] = useState(doc?.gst_enabled ?? true);
  const [gstType, setGstType] = useState<"cgst_sgst" | "igst">(doc?.gst_type ?? "cgst_sgst");
  const [gstRate, setGstRate] = useState(doc?.gst_rate ?? 18);
  const [discount, setDiscount] = useState(doc?.discount ?? 0);
  const [discountType, setDiscountType] = useState<"flat" | "percent">(doc?.discount_type ?? "flat");
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [validityDays, setValidityDays] = useState(doc?.validity_days ?? 15);
  const [executorId, setExecutorId] = useState(doc?.executor_id ?? "");
  const [managerId, setManagerId] = useState(doc?.manager_id ?? "");
  const [clientHandlerId, setClientHandlerId] = useState(doc?.client_handler_id ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showCost, setShowCost] = useState<Record<number, boolean>>({});
  const [lumpsumView, setLumpsumView] = useState(false);
  const [statusPending, startStatusTransition] = useTransition();

  const totals = useMemo(
    () => computeDocumentTotals({ lineItems, discount, discountType, gstEnabled, gstRate }),
    [lineItems, discount, discountType, gstEnabled, gstRate],
  );

  const profitSplit = useMemo(() => {
    if (!canSeeCost || totals.subtotal <= 0) return null;
    const setting = splitSettings.find(
      (s) => s.category.toLowerCase() === category.toLowerCase()
    );
    if (!setting) return null;
    return computeProfitSplit(
      {
        price: totals.subtotal,
        laborCost: sumLaborCost(lineItems as Array<{ cost_breakdown: unknown }>),
        directCost: sumDirectCost(lineItems as Array<{ cost_breakdown: unknown }>),
        category: setting.category,
      },
      setting
    );
  }, [canSeeCost, totals.subtotal, lineItems, category, splitSettings]);

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
      project_id: projectId || null,
      project_name: projectName,
      category,
      line_items: lineItems,
      subtotal: totals.subtotal,
      gst_enabled: gstEnabled,
      gst_type: gstType,
      gst_rate: gstRate,
      gst_amount: totals.gstAmount,
      discount,
      discount_type: discountType,
      total: totals.total,
      notes,
      validity_days: validityDays,
      executor_id: executorId || null,
      manager_id: managerId || null,
      client_handler_id: clientHandlerId || null,
      profit_split: profitSplit ?? null,
    };
    try {
      if (doc) {
        await updateDocument(doc.id, payload);
        toast.success(`${docType[0].toUpperCase()}${docType.slice(1)} saved`);
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
      const { id, type } = await convertDocument(doc.id);
      toast.success(`Converted to ${type}`);
      router.push(`/${type}s/${id}`);
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
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!doc) return;
    if (!window.confirm(`Delete this ${docType}? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id);
      toast.success(`${docType[0].toUpperCase()}${docType.slice(1)} deleted`);
      router.push(`/${docType}s`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const isWeb = category.toLowerCase() === "web";

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
            <Label>Link to project (optional)</Label>
            <Select
              value={projectId || "none"}
              onValueChange={(v) => {
                setProjectId(v === "none" ? "" : v);
                const p = projects.find((pr) => pr.id === v);
                if (p) setProjectName(p.name);
              }}
              disabled={!clientId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={clientId ? "No project" : "Select a client first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects
                  .filter((p) => p.client_id === clientId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {docType === "quote" && (
            <div className="space-y-1.5">
              <Label>Validity (days)</Label>
              <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
              Line items
            </h3>
            {lineItems.length > 0 && (
              <button
                onClick={() => setLumpsumView((v) => !v)}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={lumpsumView ? "Show itemised view" : "Show summary view"}
              >
                {lumpsumView ? (
                  <><LayoutList className="h-3 w-3" /> Itemised</>
                ) : (
                  <><AlignLeft className="h-3 w-3" /> Summary</>
                )}
              </button>
            )}
          </div>
          <AddLineItemDialog
            presets={presets}
            roles={roles}
            overheads={overheads}
            equipmentItems={equipmentItems}
            onAdd={(item) => setLineItems((items) => [...items, item])}
          />
        </div>

        {lineItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            No line items yet.
          </p>
        ) : lumpsumView ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p className="font-heading text-2xl font-semibold">
              ₹{totals.total.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {projectName || "Project"} · {lineItems.length} service{lineItems.length !== 1 ? "s" : ""} included
            </p>
            {gstEnabled && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Incl. {gstType === "igst" ? "IGST" : "CGST+SGST"} @ {gstRate}%
              </p>
            )}
          </div>
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
              <Label>Discount</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="flex-1"
                />
                <div className="flex rounded-lg border border-border p-0.5">
                  {(["flat", "percent"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDiscountType(t)}
                      className={`rounded-md px-2.5 text-xs font-medium transition-colors ${
                        discountType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "flat" ? "₹" : "%"}
                    </button>
                  ))}
                </div>
              </div>
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
              <span className="text-muted-foreground">Discount{discountType === "percent" ? ` (${discount}%)` : ""}</span>
              <span>-₹{totals.discountAmount}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-heading font-semibold">
              <span>Total</span>
              <span>₹{totals.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Team assignment + profit split (owner/admin only) */}
      {canSeeCost && teamMembers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
          <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
            Team Assignment
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Executor</Label>
              <Select value={executorId} onValueChange={setExecutorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isWeb ? (
              <div className="space-y-1.5">
                <Label>Client Handling</Label>
                <Select value={clientHandlerId} onValueChange={setClientHandlerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {profitSplit && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Profit Split · {profitSplit.tier.mode === "cost-plus" ? "Cost-Plus" : "Simple"} · Pool ₹{profitSplit.pool.toLocaleString("en-IN")}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Company</p>
                  <p className="text-xs font-medium">
                    ₹{profitSplit.company.toLocaleString("en-IN")} ({profitSplit.tier.company_pct}%)
                  </p>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Executor</p>
                  <p className="text-xs font-medium">
                    ₹{profitSplit.executor.toLocaleString("en-IN")} ({profitSplit.tier.executor_pct}%)
                  </p>
                </div>
                {profitSplit.is_web ? (
                  <>
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Origination</p>
                      <p className="text-xs font-medium">
                        ₹{(profitSplit.origination ?? 0).toLocaleString("en-IN")} ({profitSplit.tier.origination_pct ?? 0}%)
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Client Handling</p>
                      <p className="text-xs font-medium">
                        ₹{(profitSplit.client_handling ?? 0).toLocaleString("en-IN")} ({profitSplit.tier.client_handling_pct ?? 0}%)
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Manager</p>
                    <p className="text-xs font-medium">
                      ₹{(profitSplit.manager ?? 0).toLocaleString("en-IN")} ({profitSplit.tier.manager_pct ?? 0}%)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <Label>Notes / terms</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1.5" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : doc ? "Save changes" : "Create quote"}
        </Button>
        {doc && (
          <Button variant="outline" onClick={handleGeneratePdf} disabled={generating}>
            {generating ? "Generating…" : "Generate PDF"}
          </Button>
        )}
        {doc && NEXT_DOC_TYPE[docType] && doc.status !== "cancelled" && (
          <Button variant="outline" onClick={handleConvert}>
            Convert to {NEXT_DOC_TYPE[docType]}
          </Button>
        )}
        {doc && (
          <Select
            value={doc.status}
            onValueChange={(v) =>
              startStatusTransition(async () => {
                try {
                  await updateDocumentStatus(doc.id, v as "draft" | "sent" | "paid" | "accepted" | "cancelled");
                  toast.success(`Status set to ${v}`);
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to update status");
                }
              })
            }
            disabled={statusPending}
          >
            <SelectTrigger className="h-9 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS[docType].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {doc && (
          <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={handleDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

type LineItemMode = "preset" | "manual" | "equipment" | "external_hire" | "studio" | "boost";

function AddLineItemDialog({
  presets,
  roles,
  overheads,
  equipmentItems,
  onAdd,
}: {
  presets: Preset[];
  roles: CostRole[];
  overheads: OverheadItem[];
  equipmentItems: EquipmentItem[];
  onAdd: (item: LineItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LineItemMode>(presets.length > 0 ? "preset" : "manual");
  const [presetId, setPresetId] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState(1);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [overheadIds, setOverheadIds] = useState<string[]>([]);
  const [markup, setMarkup] = useState(0);
  const [manualRate, setManualRate] = useState("");
  // equipment rental
  const [equipmentId, setEquipmentId] = useState("");
  const [equipmentDays, setEquipmentDays] = useState(1);
  const [equipmentMarkup, setEquipmentMarkup] = useState(20);
  // external hire
  const [hireName, setHireName] = useState("");
  const [hireRate, setHireRate] = useState("");
  const [hireDays, setHireDays] = useState(1);
  const [hireMarkup, setHireMarkup] = useState(0);
  // studio rental
  const [studioDesc, setStudioDesc] = useState("Studio Rental");
  const [studioDailyRate, setStudioDailyRate] = useState("");
  const [studioDays, setStudioDays] = useState(1);
  const [studioMarkup, setStudioMarkup] = useState(0);
  // boost
  const [boostPlatform, setBoostPlatform] = useState("Meta");
  const [boostBudget, setBoostBudget] = useState("");
  const [boostMarkup, setBoostMarkup] = useState(0);

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

  function withMarkup(base: number, pct: number) {
    return Math.round(base * (1 + pct / 100) * 100) / 100;
  }

  async function handleAdd() {
    if (mode === "manual") {
      const rate = Number(manualRate);
      onAdd({ description, qty, cost_breakdown: null, rate, amount: Math.round(rate * qty * 100) / 100 });
      reset(); return;
    }
    if (mode === "equipment") {
      const eq = equipmentItems.find((e) => e.id === equipmentId);
      if (!eq || !eq.daily_rental_cost) return;
      const amount = withMarkup(equipmentBaseCost(eq, equipmentDays), equipmentMarkup);
      const rate = Math.round((amount / equipmentDays) * 100) / 100;
      onAdd({ description: `${eq.name} Rental`, qty: equipmentDays, cost_breakdown: null, rate, amount });
      reset(); return;
    }
    if (mode === "external_hire") {
      const base = Number(hireRate);
      const rate = withMarkup(base, hireMarkup);
      const amount = Math.round(rate * hireDays * 100) / 100;
      onAdd({ description: hireName || "External Creative Hire", qty: hireDays, cost_breakdown: null, rate, amount });
      reset(); return;
    }
    if (mode === "studio") {
      const base = Number(studioDailyRate);
      const rate = withMarkup(base, studioMarkup);
      const amount = Math.round(rate * studioDays * 100) / 100;
      onAdd({ description: studioDesc, qty: studioDays, cost_breakdown: null, rate, amount });
      reset(); return;
    }
    if (mode === "boost") {
      const base = Number(boostBudget);
      const rate = withMarkup(base, boostMarkup);
      onAdd({ description: `Ad Boost – ${boostPlatform}`, qty: 1, cost_breakdown: null, rate, amount: rate });
      reset(); return;
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

  function isAddDisabled() {
    if (loading) return true;
    if (mode === "preset") return !description;
    if (mode === "manual") return !description || !manualRate;
    if (mode === "equipment") return !equipmentId;
    if (mode === "external_hire") return !hireName || !hireRate;
    if (mode === "studio") return !studioDailyRate;
    if (mode === "boost") return !boostBudget;
    return false;
  }

  function reset() {
    setOpen(false);
    setPresetId(""); setDescription(""); setQty(1); setHours({}); setOverheadIds([]); setMarkup(0); setManualRate("");
    setEquipmentId(""); setEquipmentDays(1); setEquipmentMarkup(20);
    setHireName(""); setHireRate(""); setHireDays(1); setHireMarkup(0);
    setStudioDesc("Studio Rental"); setStudioDailyRate(""); setStudioDays(1); setStudioMarkup(0);
    setBoostPlatform("Meta"); setBoostBudget(""); setBoostMarkup(0);
  }

  const MODES: { key: LineItemMode; label: string }[] = [
    { key: "preset", label: "Preset" },
    { key: "manual", label: "Manual" },
    { key: "equipment", label: "Equipment" },
    { key: "external_hire", label: "Ext. Hire" },
    { key: "studio", label: "Studio" },
    { key: "boost", label: "Boost" },
  ];

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
          {/* Mode tabs */}
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <Button
                key={m.key}
                type="button"
                size="sm"
                variant={mode === m.key ? "default" : "outline"}
                onClick={() => setMode(m.key)}
                className="text-xs"
              >
                {m.label}
              </Button>
            ))}
          </div>

          {/* Preset mode */}
          {mode === "preset" && (
            <>
              <div className="space-y-1.5">
                <Label>Preset</Label>
                <Select value={presetId} onValueChange={selectPreset}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a preset" /></SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.category} · {p.name}</SelectItem>
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
                        <Input type="number" className="w-24" value={hours[r.id] ?? ""} onChange={(e) => setHours((h) => ({ ...h, [r.id]: e.target.value }))} />
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
                        <input type="checkbox" checked={overheadIds.includes(o.id)} onChange={(e) => setOverheadIds((ids) => e.target.checked ? [...ids, o.id] : ids.filter((id) => id !== o.id))} />
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
          )}

          {/* Manual mode */}
          {mode === "manual" && (
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

          {/* Equipment rental mode */}
          {mode === "equipment" && (
            <>
              {equipmentItems.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-4 text-center">
                  No equipment in inventory yet. Add items under Admin → Equipment.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Equipment</Label>
                    <Select value={equipmentId} onValueChange={setEquipmentId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select equipment" /></SelectTrigger>
                      <SelectContent>
                        {equipmentItems.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                            {e.daily_rental_cost ? ` · ₹${e.daily_rental_cost}/day` : ""}
                            {e.weekly_rental_cost ? ` · ₹${e.weekly_rental_cost}/wk` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Days</Label>
                      <Input type="number" min={1} value={equipmentDays} onChange={(e) => setEquipmentDays(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Markup (%)</Label>
                      <Input type="number" value={equipmentMarkup} onChange={(e) => setEquipmentMarkup(Number(e.target.value))} />
                    </div>
                  </div>
                  {equipmentId && (() => {
                    const eq = equipmentItems.find((e) => e.id === equipmentId);
                    if (!eq?.daily_rental_cost) return null;
                    const amount = withMarkup(equipmentBaseCost(eq, equipmentDays), equipmentMarkup);
                    const usesWeekly = eq.weekly_rental_cost && equipmentDays >= 7;
                    return (
                      <p className="text-xs text-muted-foreground">
                        {usesWeekly
                          ? `${Math.floor(equipmentDays / 7)} wk${Math.floor(equipmentDays / 7) !== 1 ? "s" : ""}${equipmentDays % 7 ? ` + ${equipmentDays % 7} day(s)` : ""}`
                          : `${equipmentDays} day${equipmentDays !== 1 ? "s" : ""}`}{" "}
                        (incl. {equipmentMarkup}% markup) = <strong>₹{amount}</strong>
                      </p>
                    );
                  })()}
                </>
              )}
            </>
          )}

          {/* External hire mode */}
          {mode === "external_hire" && (
            <>
              <div className="space-y-1.5">
                <Label>Name / description</Label>
                <Input placeholder="e.g. Freelance photographer" value={hireName} onChange={(e) => setHireName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Base rate (₹)</Label>
                  <Input type="number" value={hireRate} onChange={(e) => setHireRate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Days / qty</Label>
                  <Input type="number" min={1} value={hireDays} onChange={(e) => setHireDays(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Your markup (%)</Label>
                <Input type="number" value={hireMarkup} onChange={(e) => setHireMarkup(Number(e.target.value))} />
              </div>
              {hireRate && (
                <p className="text-xs text-muted-foreground">
                  Billed rate: ₹{Math.round(Number(hireRate) * (1 + hireMarkup / 100) * 100) / 100}/day × {hireDays} = <strong>₹{Math.round(Number(hireRate) * (1 + hireMarkup / 100) * hireDays * 100) / 100}</strong>
                </p>
              )}
            </>
          )}

          {/* Studio rental mode */}
          {mode === "studio" && (
            <>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={studioDesc} onChange={(e) => setStudioDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rate / day (₹)</Label>
                  <Input type="number" value={studioDailyRate} onChange={(e) => setStudioDailyRate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Days</Label>
                  <Input type="number" min={1} value={studioDays} onChange={(e) => setStudioDays(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Markup (%)</Label>
                <Input type="number" value={studioMarkup} onChange={(e) => setStudioMarkup(Number(e.target.value))} />
              </div>
              {studioDailyRate && (
                <p className="text-xs text-muted-foreground">
                  Total: ₹{Math.round(Number(studioDailyRate) * (1 + studioMarkup / 100) * studioDays * 100) / 100}
                </p>
              )}
            </>
          )}

          {/* Boost cost mode */}
          {mode === "boost" && (
            <>
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select value={boostPlatform} onValueChange={setBoostPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Meta", "Google", "YouTube", "LinkedIn", "Twitter / X", "Snapchat", "Other"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ad budget (₹)</Label>
                <Input type="number" value={boostBudget} onChange={(e) => setBoostBudget(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Agency markup (%)</Label>
                <Input type="number" value={boostMarkup} onChange={(e) => setBoostMarkup(Number(e.target.value))} placeholder="0 = pass-through" />
              </div>
              {boostBudget && (
                <p className="text-xs text-muted-foreground">
                  Billed: ₹{Math.round(Number(boostBudget) * (1 + boostMarkup / 100) * 100) / 100}
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={isAddDisabled()}>
            {loading ? "Pricing…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
