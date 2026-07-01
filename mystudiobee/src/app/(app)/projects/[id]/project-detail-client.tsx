"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  completeProjectStage,
  uncompleteProjectStage,
  createMom,
} from "@/lib/actions/projects";
import { createTask, updateTaskStatus } from "@/lib/actions/tasks";
import { toast } from "sonner";

const LIFECYCLE_STAGES = [
  { key: "needs_analysis", label: "Needs Analysis" },
  { key: "quote", label: "Quote" },
  { key: "quote_revision", label: "Quote Revision" },
  { key: "quote_approved", label: "Quote Approved" },
  { key: "proforma_sent", label: "Proforma Sent" },
  { key: "advance_received", label: "Advance Received" },
  { key: "in_progress", label: "In Progress" },
  { key: "second_payment", label: "2nd Payment" },
  { key: "delivery_checklist", label: "Delivery" },
  { key: "completed", label: "Completed" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  delayed: "bg-red-500/10 text-red-600",
  completed: "bg-green-500/10 text-green-600",
};

type Project = {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
  status: string;
  est_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  clients: { id: string; name: string } | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  profiles: { display_name: string; email: string } | null;
};

type Stage = { stage: string; completed_at: string | null; notes: string };
type Mom = { id: string; title: string; content: string; meeting_date: string | null };
type Document = { id: string; type: string; number: string; status: string; total: number };

export function ProjectDetailClient({
  project,
  stages,
  tasks,
  moms,
  documents,
}: {
  project: Project;
  stages: Stage[];
  tasks: Task[];
  moms: Mom[];
  documents: Document[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const completedStages = new Set(
    stages.filter((s) => s.completed_at).map((s) => s.stage)
  );

  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [showMomForm, setShowMomForm] = useState(false);
  const [momForm, setMomForm] = useState({
    title: "",
    content: "",
    meeting_date: "",
  });

  function toggleStage(stageKey: string) {
    const isDone = completedStages.has(stageKey);
    startTransition(async () => {
      try {
        if (isDone) {
          await uncompleteProjectStage(project.id, stageKey);
        } else {
          await completeProjectStage(project.id, stageKey);
        }
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function addTask() {
    if (!newTask.title.trim()) return;
    startTransition(async () => {
      try {
        await createTask({
          project_id: project.id,
          title: newTask.title,
          due_date: newTask.due_date || undefined,
        });
        setNewTask({ title: "", due_date: "" });
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function addMom() {
    if (!momForm.title.trim()) return;
    startTransition(async () => {
      try {
        await createMom({ project_id: project.id, ...momForm });
        setShowMomForm(false);
        setMomForm({ title: "", content: "", meeting_date: "" });
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <DashboardHeader title={project.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

        {/* Project meta */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {project.clients && <span>Client: <span className="text-foreground font-medium">{project.clients.name}</span></span>}
          {project.category && <span>Category: <span className="text-foreground font-medium">{project.category}</span></span>}
          <span>Type: <span className="text-foreground font-medium capitalize">{project.type}</span></span>
          {project.est_hours != null && project.est_hours > 0 && (
            <span>Est: <span className="text-foreground font-medium">{project.est_hours}h</span></span>
          )}
          {project.start_date && <span>Start: <span className="text-foreground font-medium">{project.start_date}</span></span>}
          {project.end_date && <span>End: <span className="text-foreground font-medium">{project.end_date}</span></span>}
        </div>

        {/* Lifecycle Stepper */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Project Lifecycle
          </p>
          <div className="flex flex-wrap gap-2">
            {LIFECYCLE_STAGES.map((s) => {
              const done = completedStages.has(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => toggleStage(s.key)}
                  disabled={pending}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all
                    ${done
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                >
                  {done && <Check className="h-3 w-3" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Tasks
          </p>
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground">No tasks yet.</p>
          )}
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.due_date && (
                  <p className="text-xs text-muted-foreground">Due {t.due_date}</p>
                )}
              </div>
              <button
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize cursor-pointer ${STATUS_COLORS[t.status]}`}
                title="Click to cycle status"
                onClick={async () => {
                  const cycle: Array<"pending" | "in_progress" | "delayed" | "completed"> = ["pending", "in_progress", "completed"];
                  const next = cycle[(cycle.indexOf(t.status as never) + 1) % cycle.length];
                  try {
                    await updateTaskStatus(t.id, next);
                    router.refresh();
                  } catch {
                    toast.error("Failed to update task status");
                  }
                }}
              >
                {t.status.replace("_", " ")}
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="New task..."
              value={newTask.title}
              onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && addTask()}
            />
            <Input
              type="date"
              value={newTask.due_date}
              onChange={(e) => setNewTask((f) => ({ ...f, due_date: e.target.value }))}
              className="w-36"
            />
            <Button size="sm" onClick={addTask} disabled={pending}>
              Add
            </Button>
          </div>
        </div>

        {/* MOMs */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Minutes of Meeting
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMomForm((v) => !v)}
            >
              + MOM
            </Button>
          </div>
          {showMomForm && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Input
                placeholder="Title"
                value={momForm.title}
                onChange={(e) => setMomForm((f) => ({ ...f, title: e.target.value }))}
              />
              <Textarea
                placeholder="Notes / action items..."
                value={momForm.content}
                onChange={(e) => setMomForm((f) => ({ ...f, content: e.target.value }))}
                rows={3}
              />
              <Input
                type="date"
                value={momForm.meeting_date}
                onChange={(e) =>
                  setMomForm((f) => ({ ...f, meeting_date: e.target.value }))
                }
              />
              <Button size="sm" onClick={addMom} disabled={pending}>
                Save MOM
              </Button>
            </div>
          )}
          {moms.length === 0 && !showMomForm && (
            <p className="text-xs text-muted-foreground">No meeting notes yet.</p>
          )}
          {moms.map((m) => (
            <div key={m.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{m.title}</p>
                {m.meeting_date && (
                  <p className="text-[10px] text-muted-foreground">{m.meeting_date}</p>
                )}
              </div>
              {m.content && (
                <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                  {m.content}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Linked Documents */}
        {documents.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Documents
            </p>
            {documents.map((d) => (
              <Link
                key={d.id}
                href={`/${d.type}s/${d.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
              >
                <span className="text-xs font-medium capitalize">
                  {d.type} {d.number}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {d.status}
                </span>
                <span className="ml-auto text-xs font-medium">
                  ₹{d.total?.toLocaleString("en-IN")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
