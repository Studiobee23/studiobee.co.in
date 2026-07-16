"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Eye, EyeOff, LayoutList, AlignLeft, Layers, ChevronUp, ChevronDown } from "lucide-react";
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
import type { LineItem, LineItemMeta } from "@/lib/costing/types";
import { createQuote, updateDocument, convertDocument, priceLineItem, deleteDocument, updateDocumentStatus } from "@/lib/actions/documents";

type Client = { id: string; name: string; email?: string | null };
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
  hide_pricing?: boolean;
  line_item_view?: "itemised" | "summary" | "grouped";
  summary_label?: string | null;
  summary_qty?: number | null;
  summary_rate?: number | null;
};

const STATUS_OPTIONS: Record<"quote" | "proforma" | "invoice" | "receipt", string[]> = {
  quote: ["draft", "sent", "accepted", "cancelled"],
  proforma: ["draft", "sent", "accepted", "cancelled"],
  invoice: ["draft", "sent", "paid", "cancelled"],
  receipt: ["paid", "cancelled"],
};

const NEXT_DOC_TYPE: Record<string, string> = { quote: "proforma", proforma: "invoice", invoice: "receipt" };

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
  docType?: "quote" | "proforma" | "invoice" | "receipt";
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
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const selectedClient = clients.find((c) => c.id === clientId);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", message: "" });
  const [showCost, setShowCost] = useState<Record<number, boolean>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"itemised" | "summary" | "grouped">(doc?.line_item_view ?? "itemised");
  const [hidePricing, setHidePricing] = useState(doc?.hide_pricing ?? false);
  const [summaryLabel, setSummaryLabel] = useState(doc?.summary_label ?? "");
  const [summaryQty, setSummaryQty] = useState(doc?.summary_qty ?? 1);
  const [summaryRate, setSummaryRate] = useState(doc?.summary_rate?.toString() ?? "");
  const [statusPending, startStatusTransition] = useTransition();

  const totals = useMemo(
    () => computeDocumentTotals({ lineItems, discount, discountType, gstEnabled, gstRate }),
    [lineItems, discount, discountType, gstEnabled, gstRate],
  );

  // What the client owes before GST — the default for both the summary "Rate" and
  // the grouped "Total" override, since the GST-inclusive figure was confusing as
  // a default (it double-counts tax optics when GST is broken out separately below).
  const nonGstTotal = totals.total - totals.gstAmount;

  const groupedBuckets = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, { items: Array<{ item: LineItem; idx: number }>; total: number }>();
    const unassigned: Array<{ item: LineItem; idx: number }> = [];
    lineItems.forEach((item, idx) => {
      const g = item.group?.trim();
      if (!g) {
        unassigned.push({ item, idx });
        return;
      }
      if (!groups.has(g)) {
        groups.set(g, { items: [], total: 0 });
        order.push(g);
      }
      const bucket = groups.get(g)!;
      bucket.items.push({ item, idx });
      bucket.total = Math.round((bucket.total + item.amount) * 100) / 100;
    });
    return { order, groups, unassigned };
  }, [lineItems]);

  function setItemGroup(idx: number, group: string | null) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, group } : it)));
  }

  function renameGroup(oldName: string, newName: string) {
    setLineItems((items) => items.map((it) => (it.group === oldName ? { ...it, group: newName } : it)));
  }

  // Group order is derived from first-appearance in `lineItems`, not a separate
  // stored field — so "moving" a group means physically reordering the item blocks
  // it owns. Ungrouped items always settle at the end; their own order is preserved.
  function moveGroup(groupName: string, direction: "up" | "down") {
    const order = groupedBuckets.order;
    const idx = order.indexOf(groupName);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= order.length) return;
    const newOrder = [...order];
    [newOrder[idx], newOrder[swapWith]] = [newOrder[swapWith], newOrder[idx]];

    setLineItems((items) => {
      const byGroup = new Map<string, LineItem[]>();
      const ungrouped: LineItem[] = [];
      for (const item of items) {
        const g = item.group?.trim();
        if (!g) {
          ungrouped.push(item);
          continue;
        }
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(item);
      }
      const reordered: LineItem[] = [];
      for (const g of newOrder) reordered.push(...(byGroup.get(g) ?? []));
      reordered.push(...ungrouped);
      return reordered;
    });
  }

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

  function updateLineItem(idx: number, updated: LineItem) {
    setLineItems((items) => items.map((it, i) => (i === idx ? updated : it)));
  }

  function removeLineItem(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  }

  function buildPayload() {
    return {
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
      hide_pricing: hidePricing,
      line_item_view: viewMode,
      summary_label: viewMode === "summary" ? summaryLabel.trim() || null : null,
      summary_qty: viewMode === "summary" ? summaryQty : null,
      summary_rate: viewMode === "summary" ? (summaryRate ? Number(summaryRate) : nonGstTotal) : null,
      executor_id: executorId || null,
      manager_id: managerId || null,
      client_handler_id: clientHandlerId || null,
      profit_split: profitSplit ?? null,
    };
  }

  async function handleSave() {
    if (!clientId || lineItems.length === 0) {
      toast.error("Pick a client and add at least one line item.");
      return;
    }
    setSaving(true);
    const payload = buildPayload();
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
      await updateDocument(doc.id, buildPayload());
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

  function openEmailDialog() {
    if (!doc) return;
    const label = docType[0].toUpperCase() + docType.slice(1);
    setEmailForm({
      to: selectedClient?.email ?? "",
      subject: `${label} ${doc.number} from StudioBee`,
      message: `Hi ${selectedClient?.name ?? ""},\n\nPlease find attached ${docType} ${doc.number}.\n\nThanks,\nStudioBee`,
    });
    setShowEmailDialog(true);
  }

  async function handleSendEmail() {
    if (!doc || !emailForm.to.trim()) return;
    setSendingEmail(true);
    try {
      await updateDocument(doc.id, buildPayload());
      const res = await fetch("/api/email-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: doc.id,
          to: emailForm.to,
          subject: emailForm.subject,
          message: emailForm.message,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to send email");
      toast.success(`Emailed to ${emailForm.to}`);
      setShowEmailDialog(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setSendingEmail(false);
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
              <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                {(
                  [
                    { key: "itemised", label: "Itemised", icon: LayoutList },
                    { key: "grouped", label: "Grouped", icon: Layers },
                    { key: "summary", label: "Summary", icon: AlignLeft },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setViewMode(key)}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      viewMode === key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </button>
                ))}
              </div>
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
        ) : viewMode === "summary" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Custom label shown on PDF (optional)</Label>
              <Input
                placeholder={`e.g. "1 Day Video Production" — leave blank for "${projectName || "Project"} · ${lineItems.length} service${lineItems.length !== 1 ? "s" : ""} included"`}
                value={summaryLabel}
                onChange={(e) => setSummaryLabel(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qty shown on PDF</Label>
                <Input type="number" value={summaryQty} onChange={(e) => setSummaryQty(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rate shown on PDF (₹, non-GST total by default)</Label>
                <Input
                  type="number"
                  placeholder={nonGstTotal.toString()}
                  value={summaryRate}
                  onChange={(e) => setSummaryRate(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium">
                {summaryLabel.trim() || `${projectName || "Project"} · ${lineItems.length} service${lineItems.length !== 1 ? "s" : ""} included`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Qty {summaryQty} × ₹{(summaryRate ? Number(summaryRate) : nonGstTotal).toLocaleString("en-IN")}
              </p>
              <p className="mt-1 font-heading text-2xl font-semibold">
                ₹{(summaryQty * (summaryRate ? Number(summaryRate) : nonGstTotal)).toLocaleString("en-IN")}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Actual document total (used for GST/accounting): ₹{totals.total.toLocaleString("en-IN")}
              </p>
              {gstEnabled && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Incl. {gstType === "igst" ? "IGST" : "CGST+SGST"} @ {gstRate}%
                </p>
              )}
            </div>
          </div>
        ) : viewMode === "grouped" ? (
          <div className="space-y-3">
            {groupedBuckets.order.length === 0 && (
              <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                No groups yet — pick a group for any item below to create one.
              </p>
            )}
            {groupedBuckets.order.map((groupName, i) => {
              const bucket = groupedBuckets.groups.get(groupName)!;
              return (
                <GroupCard
                  key={groupName}
                  groupName={groupName}
                  items={bucket.items}
                  total={bucket.total}
                  groupNames={groupedBuckets.order}
                  onRename={renameGroup}
                  onItemGroupChange={setItemGroup}
                  onMove={(direction) => moveGroup(groupName, direction)}
                  isFirst={i === 0}
                  isLast={i === groupedBuckets.order.length - 1}
                />
              );
            })}
            {groupedBuckets.unassigned.length > 0 && (
              <div className="rounded-lg border border-dashed border-border p-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Unassigned ({groupedBuckets.unassigned.length})
                </p>
                <div className="space-y-1.5">
                  {groupedBuckets.unassigned.map(({ item, idx }) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {item.description} — Qty {item.qty} × ₹{item.rate}
                      </span>
                      <GroupSelect
                        value={item.group ?? null}
                        groupNames={groupedBuckets.order}
                        onChange={(g) => setItemGroup(idx, g)}
                      />
                    </div>
                  ))}
                </div>
              </div>
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
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditingIdx(idx)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
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
            <div className="flex items-center justify-between">
              <Label>Hide rate &amp; amount on PDF</Label>
              <Switch checked={hidePricing} onCheckedChange={setHidePricing} />
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
        {doc && (
          <Button variant="outline" onClick={openEmailDialog}>
            Email to client
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

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {docType} to client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>To *</Label>
              <Input
                type="email"
                value={emailForm.to}
                onChange={(e) => setEmailForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="client@example.com"
              />
              {!selectedClient?.email && (
                <p className="text-xs text-muted-foreground">
                  This client has no email on file — add one or enter an address here.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={emailForm.subject}
                onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={emailForm.message}
                onChange={(e) => setEmailForm((f) => ({ ...f, message: e.target.value }))}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                The {docType} PDF is generated fresh and attached automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSendEmail} disabled={sendingEmail || !emailForm.to.trim()}>
              {sendingEmail ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LineItemFormDialog
        presets={presets}
        roles={roles}
        overheads={overheads}
        equipmentItems={equipmentItems}
        open={editingIdx !== null}
        onOpenChange={(open) => !open && setEditingIdx(null)}
        initial={editingIdx !== null ? lineItems[editingIdx] : null}
        title="Edit line item"
        submitLabel="Save"
        onSubmit={(item) => {
          if (editingIdx !== null) updateLineItem(editingIdx, item);
          setEditingIdx(null);
        }}
      />
    </div>
  );
}

function GroupSelect({
  value,
  groupNames,
  onChange,
}: {
  value: string | null;
  groupNames: string[];
  onChange: (group: string | null) => void;
}) {
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => {
        if (v === "__new__") {
          const name = window.prompt("New group name");
          if (name && name.trim()) onChange(name.trim());
          return;
        }
        onChange(v === "__none__" ? null : v);
      }}
    >
      <SelectTrigger className="h-7 w-36 text-[10px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Unassigned</SelectItem>
        {groupNames.map((g) => (
          <SelectItem key={g} value={g}>
            {g}
          </SelectItem>
        ))}
        <SelectItem value="__new__">+ New group…</SelectItem>
      </SelectContent>
    </Select>
  );
}

function GroupCard({
  groupName,
  items,
  total,
  groupNames,
  onRename,
  onItemGroupChange,
  onMove,
  isFirst,
  isLast,
}: {
  groupName: string;
  items: Array<{ item: LineItem; idx: number }>;
  total: number;
  groupNames: string[];
  onRename: (oldName: string, newName: string) => void;
  onItemGroupChange: (idx: number, group: string | null) => void;
  onMove: (direction: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(groupName);
  useEffect(() => setName(groupName), [groupName]);

  function commit() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== groupName) onRename(groupName, trimmed);
    else setName(groupName);
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMove("up")}
              disabled={isFirst}
              className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground"
              title="Move group up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onMove("down")}
              disabled={isLast}
              className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground"
              title="Move group down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="h-7 max-w-[220px] text-xs font-medium"
          />
        </div>
        <span className="whitespace-nowrap text-xs font-semibold">₹{total.toLocaleString("en-IN")}</span>
      </div>
      <div className="space-y-1.5">
        {items.map(({ item, idx }) => (
          <div key={idx} className="flex items-center justify-between gap-2 border-t border-border pt-1.5 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {item.description} — Qty {item.qty} × ₹{item.rate}
            </span>
            <GroupSelect value={item.group ?? null} groupNames={groupNames} onChange={(g) => onItemGroupChange(idx, g)} />
          </div>
        ))}
      </div>
    </div>
  );
}

type LineItemMode = "preset" | "manual" | "equipment" | "external_equipment" | "external_hire" | "studio" | "boost";

/** Shared by both "Add line item" and "Edit line item" — when `initial` is set, the
 * form pre-fills itself from `initial.meta` (falling back to a plain Manual entry if
 * the item predates `meta` tracking) instead of starting blank. */
function LineItemFormDialog({
  presets,
  roles,
  overheads,
  equipmentItems,
  open,
  onOpenChange,
  initial,
  onSubmit,
  title,
  submitLabel,
  trigger,
}: {
  presets: Preset[];
  roles: CostRole[];
  overheads: OverheadItem[];
  equipmentItems: EquipmentItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: LineItem | null;
  onSubmit: (item: LineItem) => void;
  title: string;
  submitLabel: string;
  trigger?: ReactNode;
}) {
  const [mode, setMode] = useState<LineItemMode>(presets.length > 0 ? "preset" : "manual");
  const [presetId, setPresetId] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState(1);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [overheadIds, setOverheadIds] = useState<string[]>([]);
  const [markup, setMarkup] = useState(0);
  const [manualCost, setManualCost] = useState("");
  const [manualMarkup, setManualMarkup] = useState(0);
  // equipment rental
  const [equipmentId, setEquipmentId] = useState("");
  const [equipmentDays, setEquipmentDays] = useState(1);
  const [equipmentUnits, setEquipmentUnits] = useState(1);
  const [equipmentMarkup, setEquipmentMarkup] = useState(20);
  // external equipment rental (from an outside rental house, not our inventory)
  const [extEqName, setExtEqName] = useState("");
  const [extEqRate, setExtEqRate] = useState("");
  const [extEqDays, setExtEqDays] = useState(1);
  const [extEqUnits, setExtEqUnits] = useState(1);
  const [extEqMarkup, setExtEqMarkup] = useState(20);
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

  // Re-populate the form every time the dialog opens: from `initial.meta` when editing
  // an item that has one, blank defaults when adding, or a plain Manual entry as the
  // best-effort fallback for items saved before `meta` existed.
  useEffect(() => {
    if (!open) return;
    resetFields();
    if (initial) loadFromItem(initial);
  }, [open, initial]);

  function loadFromItem(item: LineItem) {
    const meta = item.meta;
    if (meta?.mode === "manual") {
      setMode("manual");
      setDescription(item.description);
      setManualCost((meta.baseCost ?? item.rate).toString());
      setManualMarkup(meta.markupPct ?? 0);
      setQty(item.qty);
      return;
    }
    if (!meta) {
      loadFromCostBreakdown(item);
      return;
    }
    setMode(meta.mode);
    if (meta.mode === "preset") {
      setPresetId(meta.presetId);
      setDescription(item.description);
      setHours(meta.hours);
      setOverheadIds(meta.overheadIds);
      setMarkup(meta.markupPct);
      setQty(item.qty);
    } else if (meta.mode === "equipment") {
      setEquipmentId(meta.equipmentId);
      setEquipmentDays(meta.days);
      setEquipmentUnits(meta.units);
      setEquipmentMarkup(meta.markupPct);
    } else if (meta.mode === "external_equipment") {
      setExtEqName(meta.name);
      setExtEqRate(meta.rate.toString());
      setExtEqDays(meta.days);
      setExtEqUnits(meta.units);
      setExtEqMarkup(meta.markupPct);
    } else if (meta.mode === "external_hire") {
      setHireName(meta.name);
      setHireRate(meta.rate.toString());
      setHireDays(meta.days);
      setHireMarkup(meta.markupPct);
    } else if (meta.mode === "studio") {
      setStudioDesc(meta.description);
      setStudioDailyRate(meta.dailyRate.toString());
      setStudioDays(meta.days);
      setStudioMarkup(meta.markupPct);
    } else if (meta.mode === "boost") {
      setBoostPlatform(meta.platform);
      setBoostBudget(meta.budget.toString());
      setBoostMarkup(meta.markupPct);
    }
  }

  // Fallback for items saved before `meta` existed. A bare description/qty/rate
  // Manual entry would hide markup entirely even though it's sitting right there in
  // cost_breakdown — so recover as much as the breakdown actually holds instead.
  function loadFromCostBreakdown(item: LineItem) {
    const cb = item.cost_breakdown;
    if (cb && (cb.role_hours.length > 0 || cb.overheads.length > 0)) {
      // Role hours / overheads present — same shape Preset mode edits.
      setMode("preset");
      setPresetId("");
      setDescription(item.description);
      setHours(Object.fromEntries(cb.role_hours.map((rh) => [rh.role_id, String(rh.hours)])));
      setOverheadIds(cb.overheads.map((o) => o.overhead_id));
      setMarkup(cb.markup_pct);
      setQty(item.qty);
      return;
    }
    if (cb?.pass_through_cost) {
      // Pass-through-only breakdown (external equipment/hire) — no role hours to
      // show, but the markup and effective per-day rate are still recoverable.
      // withMarkup(base, m) is linear, so base = pass_through_cost / qty reproduces
      // the exact original rate regardless of whether units were folded in.
      setMode("external_hire");
      setHireName(item.description);
      setHireDays(item.qty);
      setHireRate(String(Math.round((cb.pass_through_cost / (item.qty || 1)) * 100) / 100));
      setHireMarkup(cb.markup_pct);
      return;
    }
    // No cost_breakdown at all — nothing to recover a markup from, so it starts at 0
    // (cost = the existing rate reproduces the same amount unless changed).
    setMode("manual");
    setDescription(item.description);
    setManualCost(item.rate.toString());
    setManualMarkup(0);
    setQty(item.qty);
  }

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

  // Carries over the group assignment from the item being edited (add mode has no
  // `initial`, so new items start ungrouped) and attaches the mode's meta so a later
  // edit can reopen this exact tab pre-filled.
  function submitItem(core: Omit<LineItem, "group" | "meta">, meta: LineItemMeta) {
    onSubmit({ ...core, meta, group: initial?.group ?? null });
  }

  async function handleSubmit() {
    if (mode === "manual") {
      const base = Number(manualCost);
      const rate = withMarkup(base, manualMarkup);
      submitItem(
        { description, qty, cost_breakdown: null, rate, amount: Math.round(rate * qty * 100) / 100 },
        { mode: "manual", baseCost: base, markupPct: manualMarkup },
      );
      return;
    }
    if (mode === "equipment") {
      const eq = equipmentItems.find((e) => e.id === equipmentId);
      if (!eq || !eq.daily_rental_cost) return;
      const amount = withMarkup(equipmentBaseCost(eq, equipmentDays), equipmentMarkup) * equipmentUnits;
      const rate = Math.round((amount / equipmentDays) * 100) / 100;
      const desc = equipmentUnits > 1 ? `${eq.name} Rental (x${equipmentUnits})` : `${eq.name} Rental`;
      submitItem(
        { description: desc, qty: equipmentDays, cost_breakdown: null, rate, amount },
        { mode: "equipment", equipmentId, days: equipmentDays, units: equipmentUnits, markupPct: equipmentMarkup },
      );
      return;
    }
    if (mode === "external_equipment") {
      const base = Number(extEqRate);
      const passThrough = Math.round(base * extEqDays * extEqUnits * 100) / 100;
      const amount = withMarkup(base * extEqDays, extEqMarkup) * extEqUnits;
      const rate = Math.round((amount / extEqDays) * 100) / 100;
      const desc = extEqUnits > 1 ? `${extEqName} Rental (x${extEqUnits})` : `${extEqName} Rental`;
      submitItem(
        {
          description: desc,
          qty: extEqDays,
          cost_breakdown: { role_hours: [], overheads: [], markup_pct: extEqMarkup, cost_subtotal: passThrough, pass_through_cost: passThrough },
          rate,
          amount,
        },
        { mode: "external_equipment", name: extEqName, rate: base, days: extEqDays, units: extEqUnits, markupPct: extEqMarkup },
      );
      return;
    }
    if (mode === "external_hire") {
      const base = Number(hireRate);
      const passThrough = Math.round(base * hireDays * 100) / 100;
      const rate = withMarkup(base, hireMarkup);
      const amount = Math.round(rate * hireDays * 100) / 100;
      submitItem(
        {
          description: hireName || "External Creative Hire",
          qty: hireDays,
          cost_breakdown: { role_hours: [], overheads: [], markup_pct: hireMarkup, cost_subtotal: passThrough, pass_through_cost: passThrough },
          rate,
          amount,
        },
        { mode: "external_hire", name: hireName, rate: base, days: hireDays, markupPct: hireMarkup },
      );
      return;
    }
    if (mode === "studio") {
      const base = Number(studioDailyRate);
      const rate = withMarkup(base, studioMarkup);
      const amount = Math.round(rate * studioDays * 100) / 100;
      submitItem(
        { description: studioDesc, qty: studioDays, cost_breakdown: null, rate, amount },
        { mode: "studio", description: studioDesc, dailyRate: base, days: studioDays, markupPct: studioMarkup },
      );
      return;
    }
    if (mode === "boost") {
      const base = Number(boostBudget);
      const rate = withMarkup(base, boostMarkup);
      submitItem(
        { description: `Ad Boost – ${boostPlatform}`, qty: 1, cost_breakdown: null, rate, amount: rate },
        { mode: "boost", platform: boostPlatform, budget: base, markupPct: boostMarkup },
      );
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
      submitItem(item, { mode: "preset", presetId, hours, overheadIds, markupPct: markup });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to price line item");
    } finally {
      setLoading(false);
    }
  }

  function isSubmitDisabled() {
    if (loading) return true;
    if (mode === "preset") return !description;
    if (mode === "manual") return !description || !manualCost;
    if (mode === "equipment") return !equipmentId || equipmentUnits < 1 || equipmentDays < 1;
    if (mode === "external_equipment") return !extEqName || !extEqRate || extEqUnits < 1 || extEqDays < 1;
    if (mode === "external_hire") return !hireName || !hireRate;
    if (mode === "studio") return !studioDailyRate;
    if (mode === "boost") return !boostBudget;
    return false;
  }

  function resetFields() {
    setMode(presets.length > 0 ? "preset" : "manual");
    setPresetId(""); setDescription(""); setQty(1); setHours({}); setOverheadIds([]); setMarkup(0);
    setManualCost(""); setManualMarkup(0);
    setEquipmentId(""); setEquipmentDays(1); setEquipmentUnits(1); setEquipmentMarkup(20);
    setExtEqName(""); setExtEqRate(""); setExtEqDays(1); setExtEqUnits(1); setExtEqMarkup(20);
    setHireName(""); setHireRate(""); setHireDays(1); setHireMarkup(0);
    setStudioDesc("Studio Rental"); setStudioDailyRate(""); setStudioDays(1); setStudioMarkup(0);
    setBoostPlatform("Meta"); setBoostBudget(""); setBoostMarkup(0);
  }

  const MODES: { key: LineItemMode; label: string }[] = [
    { key: "preset", label: "Preset" },
    { key: "manual", label: "Manual" },
    { key: "equipment", label: "Equipment" },
    { key: "external_equipment", label: "Ext. Equipment" },
    { key: "external_hire", label: "Ext. Hire" },
    { key: "studio", label: "Studio" },
    { key: "boost", label: "Boost" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Cost (₹)</Label>
                  <Input type="number" value={manualCost} onChange={(e) => setManualCost(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Markup (%)</Label>
                  <Input type="number" value={manualMarkup} onChange={(e) => setManualMarkup(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
                </div>
              </div>
              {manualCost && (
                <p className="text-xs text-muted-foreground">
                  Rate: ₹{withMarkup(Number(manualCost), manualMarkup)} × {qty} ={" "}
                  <strong>₹{Math.round(withMarkup(Number(manualCost), manualMarkup) * qty * 100) / 100}</strong>
                </p>
              )}
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Qty (units)</Label>
                      <Input type="number" min={1} value={equipmentUnits} onChange={(e) => setEquipmentUnits(Number(e.target.value))} />
                    </div>
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
                    const amount = withMarkup(equipmentBaseCost(eq, equipmentDays), equipmentMarkup) * equipmentUnits;
                    const usesWeekly = eq.weekly_rental_cost && equipmentDays >= 7;
                    return (
                      <p className="text-xs text-muted-foreground">
                        {equipmentUnits}x {eq.name} ·{" "}
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

          {/* External equipment rental mode (from an outside rental house) */}
          {mode === "external_equipment" && (
            <>
              <div className="space-y-1.5">
                <Label>Equipment name</Label>
                <Input placeholder="e.g. RED Komodo 6K" value={extEqName} onChange={(e) => setExtEqName(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Rate / day (₹)</Label>
                  <Input type="number" value={extEqRate} onChange={(e) => setExtEqRate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Days</Label>
                  <Input type="number" min={1} value={extEqDays} onChange={(e) => setExtEqDays(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qty (units)</Label>
                  <Input type="number" min={1} value={extEqUnits} onChange={(e) => setExtEqUnits(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Markup (%)</Label>
                <Input type="number" value={extEqMarkup} onChange={(e) => setExtEqMarkup(Number(e.target.value))} />
              </div>
              {extEqRate && (
                <p className="text-xs text-muted-foreground">
                  {extEqUnits}x {extEqName || "item"} · {extEqDays} day{extEqDays !== 1 ? "s" : ""} (incl. {extEqMarkup}% markup) ={" "}
                  <strong>₹{Math.round(withMarkup(Number(extEqRate) * extEqDays, extEqMarkup) * extEqUnits * 100) / 100}</strong>
                </p>
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
          <Button onClick={handleSubmit} disabled={isSubmitDisabled()}>
            {loading ? "Pricing…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  return (
    <LineItemFormDialog
      presets={presets}
      roles={roles}
      overheads={overheads}
      equipmentItems={equipmentItems}
      open={open}
      onOpenChange={setOpen}
      initial={null}
      title="Add line item"
      submitLabel="Add"
      trigger={
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" /> Add line item
        </Button>
      }
      onSubmit={(item) => {
        onAdd(item);
        setOpen(false);
      }}
    />
  );
}
