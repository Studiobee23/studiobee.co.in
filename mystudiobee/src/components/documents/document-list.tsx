"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { deleteDocument } from "@/lib/actions/documents";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "outline",
  sent: "secondary",
  accepted: "default",
  paid: "default",
  cancelled: "destructive",
};

export function DocumentList({
  docs,
  basePath,
  emptyText,
  canDelete = false,
}: {
  docs: Array<{
    id: string;
    number: string;
    project_name: string;
    status: string;
    total: number;
    clients: { name: string } | { name: string }[] | null;
  }>;
  basePath: string;
  emptyText: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await deleteDocument(id);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-card">
      {docs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="divide-y divide-border">
          {docs.map((d) => {
            const clientName = Array.isArray(d.clients) ? d.clients[0]?.name : d.clients?.name;
            return (
            <Link
              key={d.id}
              href={`${basePath}/${d.id}`}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  {d.number} · {d.project_name || "Untitled"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{clientName ?? "No client"}</p>
              </div>
              <Badge variant={STATUS_VARIANT[d.status] ?? "outline"} className="capitalize text-[11px]">
                {d.status}
              </Badge>
              <p className="w-24 text-right font-heading text-[13px] font-semibold tabular-nums">₹{(d.total ?? 0).toLocaleString("en-IN")}</p>
              {canDelete && (
                <button
                  onClick={(e) => handleDelete(e, d.id)}
                  disabled={pending}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
