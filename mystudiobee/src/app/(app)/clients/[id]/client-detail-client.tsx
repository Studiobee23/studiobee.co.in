"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { ClientFormSheet, type ClientRecord } from "../client-form-sheet";

type Document = {
  id: string;
  type: "quote" | "invoice" | "receipt";
  number: string;
  project_name: string;
  status: string;
  total: number;
  created_at: string;
};

export function ClientDetailClient({
  client,
  documents,
}: {
  client: ClientRecord & { id: string };
  documents: Document[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
            Client details
          </h3>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Detail label="Contact person" value={client.contact_person} />
          <Detail label="Email" value={client.email} />
          <Detail label="Phone" value={client.phone} />
          <Detail label="GSTIN" value={client.gstin} />
          <Detail label="City" value={client.city} />
          <Detail label="State" value={client.state} />
          <Detail label="Lead source" value={client.lead_source} />
        </div>
        {client.notes && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{client.notes}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="mb-4 font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
          Quotes, invoices &amp; receipts
        </h3>
        {documents.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nothing yet for this client.</p>
        ) : (
          <div className="divide-y divide-border">
            {documents.map((d) => (
              <Link
                key={d.id}
                href={`/${d.type}s/${d.id}`}
                className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {d.number} · {d.project_name || "Untitled"}
                  </p>
                  <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                    {d.type} · {d.status}
                  </p>
                </div>
                <p className="font-heading text-xs font-medium">₹{d.total ?? 0}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ClientFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || "—"}</p>
    </div>
  );
}
