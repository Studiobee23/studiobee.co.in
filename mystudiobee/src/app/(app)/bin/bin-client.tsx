"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { restoreClient } from "@/lib/actions/clients";

type BinnedClient = { id: string; name: string; city: string; deleted_at: string };

const PURGE_AFTER_DAYS = 30;

function daysRemaining(deletedAt: string) {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(PURGE_AFTER_DAYS - elapsed));
}

export function BinClient({ clients }: { clients: BinnedClient[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRestore(client: BinnedClient) {
    if (!window.confirm(`Restore "${client.name}" and everything under it?`)) return;
    setPendingId(client.id);
    startTransition(async () => {
      try {
        await restoreClient(client.id);
        toast.success(`${client.name} restored`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to restore");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Trash2 className="h-3.5 w-3.5" />
        Deleted clients are kept here for {PURGE_AFTER_DAYS} days, along with all their projects,
        tasks and documents, before being permanently removed.
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        {clients.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Bin is empty.</div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-snug">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.city ? `${c.city} · ` : ""}Deleted{" "}
                    {new Date(c.deleted_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  {daysRemaining(c.deleted_at)}d left
                </span>
                <button
                  onClick={() => handleRestore(c)}
                  disabled={pending && pendingId === c.id}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" /> Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
