"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateLongIST } from "@/lib/datetime";
import { deriveNdaStatus, type NdaAgreementStatus } from "@/lib/nda/status";
import type { NdaAgreementRow } from "@/lib/nda/types";
import { createNdaAgreement, sendNdaAgreementEmail, voidNdaAgreement, getNdaPdfDownloadUrl, regenerateNdaPdf } from "@/lib/actions/nda";

const STATUS_VARIANT: Record<NdaAgreementStatus, "default" | "secondary" | "destructive" | "outline"> = {
  signed: "default",
  pending: "secondary",
  expired: "destructive",
  voided: "outline",
};
const STATUS_LABEL: Record<NdaAgreementStatus, string> = {
  signed: "Signed",
  pending: "Pending",
  expired: "Expired",
  voided: "Voided",
};

export function NdaAgreementsCard({ clientId, agreements }: { clientId: string; agreements: NdaAgreementRow[] }) {
  const [rows, setRows] = useState(agreements);
  const [newOpen, setNewOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [pending, startTransition] = useTransition();
  const [newLink, setNewLink] = useState<string | null>(null);

  function handleCreate() {
    startTransition(async () => {
      try {
        const { url } = await createNdaAgreement(clientId, purpose);
        setNewLink(url);
        toast.success("NDA created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create NDA");
      }
    });
  }

  function handleSend(id: string) {
    startTransition(async () => {
      try {
        await sendNdaAgreementEmail(id);
        toast.success("Emailed to client");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to send email");
      }
    });
  }

  function handleVoid(id: string) {
    if (!window.confirm("Void this NDA link? It can no longer be signed.")) return;
    startTransition(async () => {
      try {
        await voidNdaAgreement(id);
        setRows((r) => r.map((row) => (row.id === id ? { ...row, status: "voided" } : row)));
        toast.success("Voided");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to void");
      }
    });
  }

  function handleViewPdf(id: string) {
    startTransition(async () => {
      try {
        const url = await getNdaPdfDownloadUrl(id);
        window.open(url, "_blank");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "PDF not available");
      }
    });
  }

  function handleRegeneratePdf(id: string) {
    startTransition(async () => {
      try {
        await regenerateNdaPdf(id);
        toast.success("PDF regenerated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to regenerate PDF");
      }
    });
  }

  async function copyLink(token: string) {
    const baseUrl = window.location.origin;
    await navigator.clipboard.writeText(`${baseUrl}/nda/${token}`);
    toast.success("Link copied");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">NDA Agreements</h3>
        <Button size="sm" onClick={() => { setNewLink(null); setPurpose(""); setNewOpen(true); }}>
          New NDA
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No NDAs sent to this client yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => {
            const status = deriveNdaStatus(row);
            return (
              <div key={row.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      Created {formatDateLongIST(row.created_at)}
                      {row.signed_at ? ` · Signed ${formatDateLongIST(row.signed_at)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status === "pending" && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => copyLink(row.token)}>
                        Copy link
                      </Button>
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => handleSend(row.id)}>
                        Send email
                      </Button>
                      <Button size="xs" variant="destructive" disabled={pending} onClick={() => handleVoid(row.id)}>
                        Void
                      </Button>
                    </>
                  )}
                  {status === "signed" && (
                    <>
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => handleViewPdf(row.id)}>
                        View PDF
                      </Button>
                      {!row.pdf_storage_path && (
                        <Button size="xs" variant="outline" disabled={pending} onClick={() => handleRegeneratePdf(row.id)}>
                          Regenerate PDF
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New NDA</DialogTitle>
          </DialogHeader>
          {newLink ? (
            <div>
              <p className="mb-2 text-sm">Link created:</p>
              <Input readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} />
            </div>
          ) : (
            <div>
              <Label htmlFor="purpose">Engagement description (optional)</Label>
              <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. website redesign and brand identity" />
            </div>
          )}
          <DialogFooter>
            {newLink ? (
              <Button onClick={() => { setNewOpen(false); window.location.reload(); }}>Done</Button>
            ) : (
              <Button disabled={pending} onClick={handleCreate}>
                Create
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
