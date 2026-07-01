"use client";

import { useTransition } from "react";
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

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  payment_linked: boolean;
  payment_amount: number | null;
  projects: { name: string } | null;
  profiles: { display_name: string; email: string } | null;
};

export function TasksClient({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const stats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    delayed: tasks.filter((t) => t.status === "delayed").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

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
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "pending", label: "Pending" },
            { key: "in_progress", label: "In Progress" },
            { key: "delayed", label: "Delayed" },
            { key: "completed", label: "Completed" },
          ].map(({ key, label }) => (
            <div key={key} className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-heading text-2xl font-semibold">
                {stats[key as keyof typeof stats]}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {!tasks.length && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No tasks yet. Add tasks from within a project.
            </div>
          )}
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.projects ? (
                    <Link
                      href={`/projects/${t.projects.name}`}
                      className="hover:underline"
                    >
                      {t.projects.name}
                    </Link>
                  ) : (
                    "No project"
                  )}
                  {t.due_date ? ` · Due ${t.due_date}` : ""}
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
      </div>
    </>
  );
}
