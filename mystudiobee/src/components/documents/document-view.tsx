"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { convertDocument, updateDocumentStatus } from "@/lib/actions/documents";
import type { LineItem } from "@/lib/costing/types";

type Client = {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
} | null;

export type DocView = {
  id: string;
  type: "quote" | "invoice" | "receipt";
  number: string;
  status: string;
  project_name: string;
  line_items: Partial<LineItem>[];
  subtotal: number;
  gst_enabled: boolean;
  gst_type: "cgst_sgst" | "igst";
  gst_rate: number;
  gst_amount: number;
  discount: number;
  total: number;
  notes: string;
  clients: Client;
};

const NEXT_LABEL: Record<string, string> = { quote: "invoice", invoice: "receipt" };
const NEXT_PATH: Record<string, string> = { quote: "invoices", invoice: "receipts" };

export function DocumentView({ doc }: { doc: DocView }) {
  const router = useRouter();
  const canConvert = doc.type === "quote" || doc.type === "invoice";
  const canMarkPaid = (doc.type === "invoice" || doc.type === "receipt") && doc.status !== "paid";
  const [generating, setGenerating] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  async function handleMarkPaid() {
    setMarkingPaid(true);
    try {
      await updateDocumentStatus(doc.id, "paid");
      toast.success("Marked as paid");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleConvert() {
    try {
      const { id } = await convertDocument(doc.id);
      toast.success(`Converted to ${NEXT_LABEL[doc.type]}`);
      router.push(`/${NEXT_PATH[doc.type]}/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to convert");
    }
  }

  async function handleGeneratePdf() {
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
        <div className="flex items-start justify-between">
          <div>
            <p className="font-heading text-lg font-semibold">{doc.project_name || "Untitled"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{doc.clients?.name ?? "No client"}</p>
          </div>
          <Badge variant="outline" className="capitalize">
            {doc.status}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="mb-3 font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
          Line items
        </h3>
        <div className="space-y-2">
          {doc.line_items.map((li, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-xs font-medium">{li.description}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Qty {li.qty} × ₹{li.rate}</p>
              </div>
              <p className="font-heading text-xs font-medium">₹{li.amount}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>₹{doc.subtotal}</span>
          </div>
          {doc.gst_enabled && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                GST ({doc.gst_rate}%, {doc.gst_type === "igst" ? "IGST" : "CGST+SGST"})
              </span>
              <span>₹{doc.gst_amount}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>-₹{doc.discount}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-heading font-semibold">
            <span>Total</span>
            <span>₹{doc.total}</span>
          </div>
        </div>
      </div>

      {doc.notes && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-2 font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{doc.notes}</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleGeneratePdf} disabled={generating}>
          {generating ? "Generating…" : "Generate PDF"}
        </Button>
        {canConvert && (
          <Button variant="outline" onClick={handleConvert}>
            Convert to {NEXT_LABEL[doc.type]}
          </Button>
        )}
        {canMarkPaid && (
          <Button onClick={handleMarkPaid} disabled={markingPaid}>
            {markingPaid ? "Saving…" : "Mark as Paid"}
          </Button>
        )}
      </div>
    </div>
  );
}
