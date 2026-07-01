import Link from "next/link";
import { Badge } from "@/components/ui/badge";

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
}) {
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
              className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {d.number} · {d.project_name || "Untitled"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{clientName ?? "No client"}</p>
              </div>
              <Badge variant={STATUS_VARIANT[d.status] ?? "outline"} className="capitalize">
                {d.status}
              </Badge>
              <p className="w-20 text-right font-heading text-sm font-medium">₹{d.total ?? 0}</p>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
