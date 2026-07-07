"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  delayed: "bg-red-500/10 text-red-600",
  completed: "bg-green-500/10 text-green-600",
};

const STATUS_ORDER = ["pending", "in_progress", "delayed", "completed"] as const;
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  delayed: "Delayed",
  completed: "Completed",
};

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  project_id: string | null;
  payment_linked: boolean;
  payment_amount: number | null;
  projects: { name: string } | null;
  profiles: { display_name: string; email: string } | null;
};

type GroupBy = "project" | "status" | "none";

export function TasksClient({ tasks, initialStatus }: { tasks: Task[]; initialStatus?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string | null>(initialStatus ?? null);
  const [groupBy, setGroupBy] = useState<GroupBy>("project");

  const stats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    delayed: tasks.filter((t) => t.status === "delayed").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  const filteredTasks = useMemo(
    () => (statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks),
    [tasks, statusFilter]
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: null, tasks: filteredTasks }];
    if (groupBy === "status") {
      return STATUS_ORDER.map((s) => ({
        key: s,
        label: STATUS_LABELS[s],
        tasks: filteredTasks.filter((t) => t.status === s),
      })).filter((g) => g.tasks.length > 0);
    }
    // group by project
    const byProject = new Map<string, { label: string; projectId: string | null; tasks: Task[] }>();
    for (const t of filteredTasks) {
      const key = t.project_id ?? "none";
      const label = t.projects?.name ?? "No project";
      if (!byProject.has(key)) byProject.set(key, { label, projectId: t.project_id, tasks: [] });
      byProject.get(key)!.tasks.push(t);
    }
    return Array.from(byProject.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, v]) => ({ key, label: v.label, projectId: v.projectId, tasks: v.tasks }));
  }, [filteredTasks, groupBy]);

  function changeStatus(id: string, status: string) {
    startTransition(async () => {
      try {
        await updateTaskStatus(
          id,
          status as "pending" | "in_progress" | "delayed" | "completed"
        );
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <DashboardHeader title="Tasks" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Stats — click to filter */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUS_ORDER.map((key) => (
            <button
              key={key}
              onClick={() => setStatusFilter((cur) => (cur === key ? null : key))}
              className={`rounded-xl border p-4 text-center transition-colors duration-100 ${
                statusFilter === key
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <p className="font-heading text-2xl font-semibold">{stats[key]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{STATUS_LABELS[key]}</p>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/70"
            >
              Filter: {STATUS_LABELS[statusFilter]} ✕
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="status">Progress</SelectItem>
                <SelectItem value="none">All together</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Task list */}
        <div className="space-y-6">
          {!filteredTasks.length && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              {tasks.length ? "No tasks match this filter." : "No tasks yet. Add tasks from within a project."}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              {g.label && (
                <div className="flex items-center gap-2 px-1">
                  {"projectId" in g && g.projectId ? (
                    <Link
                      href={`/projects/${g.projectId}`}
                      className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {g.label}
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {g.label}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/60">({g.tasks.length})</span>
                </div>
              )}
              {g.tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {groupBy !== "project" && t.projects ? (
                        <>
                          <Link href={`/projects/${t.project_id}`} className="hover:underline">
                            {t.projects.name}
                          </Link>
                          {" · "}
                        </>
                      ) : groupBy !== "project" ? (
                        "No project · "
                      ) : null}
                      {t.due_date ? `Due ${t.due_date}` : "No due date"}
                      {t.payment_linked && t.payment_amount
                        ? ` · ₹${t.payment_amount.toLocaleString("en-IN")} payment`
                        : ""}
                    </p>
                  </div>
                  <Select
                    value={t.status}
                    onValueChange={(v) => changeStatus(t.id, v)}
                    disabled={pending}
                  >
                    <SelectTrigger
                      className={`w-32 text-xs ${STATUS_COLORS[t.status] ?? ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="delayed">Delayed</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
