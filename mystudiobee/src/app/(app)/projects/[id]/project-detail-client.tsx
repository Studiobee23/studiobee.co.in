"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Plus, Trash2, ChevronDown, Pencil } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { EditProjectSheet } from "./edit-project-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  completeProjectStage,
  uncompleteProjectStage,
  createMom,
  updateProjectStatus,
  createExpense,
  deleteExpense,
  createChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  upsertRetainerMonth,
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

const EXPENSE_CATEGORIES = [
  { value: "amenities", label: "Amenities" },
  { value: "boost", label: "Ad Boost" },
  { value: "studio", label: "Studio Charge" },
  { value: "equipment_rental", label: "Equipment Rental" },
  { value: "external_hire", label: "External Creative Hire" },
  { value: "other", label: "Other" },
];

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  on_hold: "bg-yellow-500/10 text-yellow-700",
  completed: "bg-blue-500/10 text-blue-600",
  cancelled: "bg-red-500/10 text-red-600",
};

const RETAINER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  invoiced: "bg-purple-500/10 text-purple-600",
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
  deleted_at?: string | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  profiles: { display_name: string; email: string } | null;
};

type Stage = { stage: string; completed_at: string | null; notes: string };
type Mom = { id: string; title: string; content: string; meeting_date: string | null; attendees: string[] | null };
type Document = { id: string; type: string; number: string; status: string; total: number };
type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  gst_amount: number;
  vendor: string;
  expense_date: string | null;
  receipt_url: string;
};
type ChecklistItem = { id: string; item: string; completed: boolean; sort_order: number };
type RetainerMonth = { id: string; month: string; status: string; notes: string };

export function ProjectDetailClient({
  project,
  stages,
  tasks,
  moms,
  documents,
  expenses,
  checklist,
  retainerMonths,
  clients,
}: {
  project: Project;
  stages: Stage[];
  tasks: Task[];
  moms: Mom[];
  documents: Document[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  retainerMonths: RetainerMonth[];
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showEdit, setShowEdit] = useState(false);

  const completedStages = new Set(stages.filter((s) => s.completed_at).map((s) => s.stage));

  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [showMomForm, setShowMomForm] = useState(false);
  const [momForm, setMomForm] = useState({
    title: "",
    meeting_date: "",
    agenda: "",
    discussion: "",
    actionItems: "",
  });
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "other",
    description: "",
    amount: "",
    gst_amount: "",
    vendor: "",
    expense_date: "",
  });
  const [newChecklistItem, setNewChecklistItem] = useState("");

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function toggleStage(stageKey: string) {
    const isDone = completedStages.has(stageKey);
    run(() => isDone ? uncompleteProjectStage(project.id, stageKey) : completeProjectStage(project.id, stageKey));
  }

  function addTask() {
    if (!newTask.title.trim()) return;
    run(async () => {
      await createTask({ project_id: project.id, title: newTask.title, due_date: newTask.due_date || undefined });
      setNewTask({ title: "", due_date: "" });
    });
  }

  function addAttendee() {
    const name = attendeeInput.trim();
    if (!name || attendees.includes(name)) return;
    setAttendees((a) => [...a, name]);
    setAttendeeInput("");
  }

  function addMom() {
    if (!momForm.title.trim()) return;
    const sections = [
      momForm.agenda.trim() && `Agenda:\n${momForm.agenda.trim()}`,
      momForm.discussion.trim() && `Discussion:\n${momForm.discussion.trim()}`,
      momForm.actionItems.trim() && `Action Items:\n${momForm.actionItems.trim()}`,
    ].filter(Boolean);
    run(async () => {
      await createMom({
        project_id: project.id,
        title: momForm.title,
        meeting_date: momForm.meeting_date || undefined,
        attendees,
        content: sections.join("\n\n"),
      });
      setShowMomForm(false);
      setMomForm({ title: "", meeting_date: "", agenda: "", discussion: "", actionItems: "" });
      setAttendees([]);
      setAttendeeInput("");
    });
  }

  function addExpense() {
    if (!expenseForm.description.trim() || !expenseForm.amount) return;
    run(async () => {
      await createExpense({
        project_id: project.id,
        category: expenseForm.category,
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        gst_amount: expenseForm.gst_amount ? parseFloat(expenseForm.gst_amount) : 0,
        vendor: expenseForm.vendor || undefined,
        expense_date: expenseForm.expense_date || undefined,
      });
      setShowExpenseForm(false);
      setExpenseForm({ category: "other", description: "", amount: "", gst_amount: "", vendor: "", expense_date: "" });
    });
  }

  function addChecklistItem() {
    if (!newChecklistItem.trim()) return;
    run(async () => {
      await createChecklistItem(project.id, newChecklistItem, checklist.length);
      setNewChecklistItem("");
    });
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount + e.gst_amount, 0);

  return (
    <>
      <DashboardHeader title={project.name} backHref="/projects">
        <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </DashboardHeader>
      <EditProjectSheet
        open={showEdit}
        onOpenChange={setShowEdit}
        projectId={project.id}
        clients={clients}
        project={{
          name: project.name,
          description: project.description ?? "",
          category: project.category ?? "",
          type: project.type,
          client_id: project.clients?.id ?? "",
          est_hours: project.est_hours,
          start_date: project.start_date,
          end_date: project.end_date,
        }}
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {project.deleted_at && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-800">
            This project&apos;s client is in the{" "}
            <Link href="/bin" className="font-medium underline underline-offset-2">
              Bin
            </Link>
            . Restore the client from there to make changes here.
          </div>
        )}

        {/* Project meta + status */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {project.clients && (
            <span>Client: <Link href={`/clients/${project.clients.id}`} className="text-foreground font-medium hover:underline">{project.clients.name}</Link></span>
          )}
          {project.category && <span>Category: <span className="text-foreground font-medium">{project.category}</span></span>}
          <span>Type: <span className="text-foreground font-medium capitalize">{project.type}</span></span>
          {project.est_hours != null && project.est_hours > 0 && (
            <span>Est: <span className="text-foreground font-medium">{project.est_hours}h</span></span>
          )}
          {project.start_date && <span>Start: <span className="text-foreground font-medium">{project.start_date}</span></span>}
          {project.end_date && <span>End: <span className="text-foreground font-medium">{project.end_date}</span></span>}
          {/* Status badge + quick change */}
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={project.status}
              onValueChange={(v) => run(() => updateProjectStatus(project.id, v as "active" | "on_hold" | "completed" | "cancelled"))}
            >
              <SelectTrigger className={`h-7 gap-1 border-none px-2.5 py-0 text-[11px] font-semibold ${PROJECT_STATUS_COLORS[project.status] ?? ""}`}>
                <SelectValue />
                <ChevronDown className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
        )}

        {/* Lifecycle Stepper */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Project Lifecycle</p>
          <div className="flex flex-wrap gap-2">
            {LIFECYCLE_STAGES.map((s) => {
              const done = completedStages.has(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => toggleStage(s.key)}
                  disabled={pending}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-100
                    ${done ? "bg-primary text-primary-foreground" : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {done && <Check className="h-3 w-3" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Retainer monthly tracker (only for retainer type) */}
        {project.type === "retainer" && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Monthly Tracker</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
                  run(() => upsertRetainerMonth({ project_id: project.id, month, status: "pending" }));
                }}
              >
                <Plus className="h-3 w-3" /> Add Month
              </Button>
            </div>
            {retainerMonths.length === 0 ? (
              <p className="text-xs text-muted-foreground">No months tracked yet.</p>
            ) : (
              <div className="space-y-2">
                {retainerMonths.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="text-xs font-medium">{new Date(m.month + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
                    <Select
                      value={m.status}
                      onValueChange={(v) => run(() => upsertRetainerMonth({ project_id: project.id, month: m.month, status: v as "pending" | "in_progress" | "completed" | "invoiced" }))}
                    >
                      <SelectTrigger className={`h-6 w-32 border-none px-2 py-0 text-[11px] font-medium ${RETAINER_STATUS_COLORS[m.status]}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="invoiced">Invoiced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tasks */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tasks</p>
          {tasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks yet.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.due_date && <p className="text-xs text-muted-foreground">Due {t.due_date}</p>}
              </div>
              <button
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize cursor-pointer ${STATUS_COLORS[t.status]}`}
                title="Click to cycle status"
                onClick={() => {
                  const cycle: Array<"pending" | "in_progress" | "delayed" | "completed"> = ["pending", "in_progress", "completed"];
                  const next = cycle[(cycle.indexOf(t.status as never) + 1) % cycle.length];
                  run(() => updateTaskStatus(t.id, next));
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
            <Button size="sm" onClick={addTask} disabled={pending}>Add</Button>
          </div>
        </div>

        {/* Expenses */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Expenses</p>
              {expenses.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">Total: ₹{totalExpenses.toLocaleString("en-IN")}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowExpenseForm((v) => !v)}>
              <Plus className="h-3 w-3" /> Add Expense
            </Button>
          </div>
          {showExpenseForm && (
            <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Vendor / party"
                  value={expenseForm.vendor}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, vendor: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Description *"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  placeholder="Amount (₹) *"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                />
                <Input
                  type="number"
                  placeholder="GST (₹)"
                  value={expenseForm.gst_amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, gst_amount: e.target.value }))}
                />
                <Input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addExpense} disabled={pending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowExpenseForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
          {expenses.length === 0 && !showExpenseForm && (
            <p className="text-xs text-muted-foreground">No expenses yet.</p>
          )}
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{e.description}</p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                  {e.vendor ? ` · ${e.vendor}` : ""}
                  {e.expense_date ? ` · ${e.expense_date}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold">₹{(e.amount).toLocaleString("en-IN")}</p>
                {e.gst_amount > 0 && <p className="text-[10px] text-muted-foreground">+₹{e.gst_amount.toLocaleString("en-IN")} GST</p>}
              </div>
              <button
                className="text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => run(() => deleteExpense(e.id, project.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Delivery Checklist */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Delivery Checklist</p>
          {checklist.length === 0 && <p className="text-xs text-muted-foreground">No checklist items yet.</p>}
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <button
                onClick={() => run(() => toggleChecklistItem(item.id, !item.completed, project.id))}
                className={`h-4 w-4 shrink-0 rounded border transition-colors ${item.completed ? "bg-primary border-primary" : "border-border hover:border-primary/50"}`}
              >
                {item.completed && <Check className="h-3 w-3 text-white mx-auto" />}
              </button>
              <span className={`flex-1 text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                {item.item}
              </span>
              <button
                className="text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => run(() => deleteChecklistItem(item.id, project.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="Add checklist item..."
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
              className="flex-1"
            />
            <Button size="sm" onClick={addChecklistItem} disabled={pending}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* MOMs */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Minutes of Meeting</p>
            <Button variant="outline" size="sm" onClick={() => setShowMomForm((v) => !v)}>+ MOM</Button>
          </div>
          {showMomForm && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Title"
                  value={momForm.title}
                  onChange={(e) => setMomForm((f) => ({ ...f, title: e.target.value }))}
                />
                <Input
                  type="date"
                  value={momForm.meeting_date}
                  onChange={(e) => setMomForm((f) => ({ ...f, meeting_date: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Attendees</label>
                <div className="flex flex-wrap gap-1.5">
                  {attendees.map((a) => (
                    <span key={a} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {a}
                      <button onClick={() => setAttendees((list) => list.filter((x) => x !== a))} className="text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add attendee name, press Enter"
                    value={attendeeInput}
                    onChange={(e) => setAttendeeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addAttendee(); }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addAttendee}>Add</Button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Agenda</label>
                <Textarea
                  placeholder="What was this meeting about?"
                  value={momForm.agenda}
                  onChange={(e) => setMomForm((f) => ({ ...f, agenda: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Discussion / decisions</label>
                <Textarea
                  placeholder="What was discussed or decided..."
                  value={momForm.discussion}
                  onChange={(e) => setMomForm((f) => ({ ...f, discussion: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Action items</label>
                <Textarea
                  placeholder={"One per line, e.g. \"Nikhil to send revised quote by Friday\""}
                  value={momForm.actionItems}
                  onChange={(e) => setMomForm((f) => ({ ...f, actionItems: e.target.value }))}
                  rows={3}
                />
              </div>

              <Button size="sm" onClick={addMom} disabled={pending}>Save MOM</Button>
            </div>
          )}
          {moms.length === 0 && !showMomForm && (
            <p className="text-xs text-muted-foreground">No meeting notes yet.</p>
          )}
          {moms.map((m) => (
            <div key={m.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{m.title}</p>
                {m.meeting_date && <p className="text-[10px] text-muted-foreground">{m.meeting_date}</p>}
              </div>
              {m.attendees && m.attendees.length > 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Attendees: {m.attendees.join(", ")}
                </p>
              )}
              {m.content && <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-line">{m.content}</p>}
            </div>
          ))}
        </div>

        {/* Linked Documents */}
        {documents.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Documents</p>
            {documents.map((d) => (
              <Link
                key={d.id}
                href={`/${d.type}s/${d.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
              >
                <span className="text-xs font-medium capitalize">{d.type} {d.number}</span>
                <span className="text-xs text-muted-foreground capitalize">{d.status}</span>
                <span className="ml-auto text-xs font-medium">₹{d.total?.toLocaleString("en-IN")}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
