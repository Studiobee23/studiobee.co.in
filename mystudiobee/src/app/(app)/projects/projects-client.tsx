"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  on_hold: "bg-yellow-500/10 text-yellow-600",
  completed: "bg-blue-500/10 text-blue-600",
  cancelled: "bg-red-500/10 text-red-600",
};

type Project = {
  id: string;
  name: string;
  type: string;
  status: string;
  category: string | null;
  est_hours: number | null;
  clients: { name: string } | null;
};

export function ProjectsClient({ projects }: { projects: Project[] }) {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const categories = useMemo(
    () => Array.from(new Set(projects.map((p) => p.category).filter(Boolean))) as string[],
    [projects]
  );

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) => (status === "all" || p.status === status) && (category === "all" || p.category === category)
      ),
    [projects, status, category]
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {categories.length > 0 && (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(status !== "all" || category !== "all") && (
          <span className="text-xs text-muted-foreground">{filtered.length} of {projects.length}</span>
        )}
      </div>

      <div className="space-y-2">
        {!filtered.length && (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            {projects.length ? "No projects match these filters." : "No projects yet — create your first one."}
          </div>
        )}
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3.5 transition-colors duration-100 hover:bg-muted/40 hover:shadow-card-hover"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-snug">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.clients?.name ?? "No client"}
                {p.category ? ` · ${p.category}` : ` · ${p.type}`}
                {p.est_hours ? ` · ${p.est_hours}h est.` : ""}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}
            >
              {p.status.replace("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
