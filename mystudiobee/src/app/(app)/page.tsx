import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FileText,
  Users,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  PieChart,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { getCurrentProfile, isBillingRole, canSeeCost } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { sumLaborCost, sumDirectCost } from "@/lib/profit-split/engine";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (!isBillingRole(profile.role)) {
    redirect("/tasks");
  }

  const supabase = await createClient();
  const showMargin = canSeeCost(profile.role);

  const [
    { data: recentClients },
    { data: recentQuotes },
    { data: tasks },
    { data: recentProjects },
    { data: invoiceDocs },
    { data: marginDocs },
  ] = await Promise.all([
    supabase.from("clients").select("id, name, city, avatar_url, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("documents").select("id, number, project_name, status, total, created_at").eq("type", "quote").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("tasks").select("id, status, due_date, title, project_id, projects(name)").is("deleted_at", null).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("projects").select("id, name, status, type, clients(name)").eq("status", "active").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("documents").select("id, number, project_name, status, total, created_at, updated_at").eq("type", "invoice").is("deleted_at", null).order("created_at", { ascending: true }),
    showMargin
      ? supabase.from("documents").select("id, total, line_items, created_at").in("type", ["invoice", "receipt"]).in("status", ["paid", "accepted"]).is("deleted_at", null)
      : Promise.resolve({ data: null as { id: string; total: number; line_items: unknown; created_at: string }[] | null }),
  ]);

  const taskCounts = {
    pending: tasks?.filter((t) => t.status === "pending").length ?? 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length ?? 0,
    delayed: tasks?.filter((t) => t.status === "delayed").length ?? 0,
    completed: tasks?.filter((t) => t.status === "completed").length ?? 0,
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks?.filter(
    (t) => t.status !== "completed" && t.due_date && t.due_date < today
  ) ?? [];

  // Documents have no due_date — an invoice counts as "overdue" once it has sat
  // in "sent" status for 30+ days (standard net-30 assumption) without payment.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const sentInvoices = invoiceDocs?.filter((d) => d.status === "sent") ?? [];
  const outstandingTotal = sentInvoices.reduce((s, d) => s + (d.total ?? 0), 0);
  const overdueInvoices = sentInvoices.filter((d) => new Date(d.created_at) < thirtyDaysAgo);
  const overdueTotal = overdueInvoices.reduce((s, d) => s + (d.total ?? 0), 0);
  const collectedThisMonth = (invoiceDocs ?? [])
    .filter((d) => d.status === "paid" && new Date(d.updated_at ?? d.created_at) >= monthStart)
    .reduce((s, d) => s + (d.total ?? 0), 0);

  const marginRowsThisMonth = (marginDocs ?? []).filter((d) => new Date(d.created_at) >= monthStart);
  const monthRevenue = marginRowsThisMonth.reduce((s, d) => s + (d.total ?? 0), 0);
  const monthCost = marginRowsThisMonth.reduce((s, d) => {
    const items = (d.line_items ?? []) as Array<{ cost_breakdown: unknown }>;
    return s + sumLaborCost(items) + sumDirectCost(items);
  }, 0);
  const monthProfit = monthRevenue - monthCost;
  const marginPct = monthRevenue > 0 ? Math.round((monthProfit / monthRevenue) * 100) : 0;
  const marginCircumference = 2 * Math.PI * 40;
  const marginDash = (Math.max(0, Math.min(100, marginPct)) / 100) * marginCircumference;

  return (
    <>
      <DashboardHeader title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Welcome back, {profile.display_name || profile.email}
            </h2>
            <div className="flex gap-2">
              <Link
                href="/clients?new=1"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-card hover:bg-muted transition-colors duration-100"
              >
                <Plus className="h-3.5 w-3.5" /> Client
              </Link>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-card hover:bg-muted transition-colors duration-100"
              >
                <Plus className="h-3.5 w-3.5" /> Project
              </Link>
              <Link
                href="/quotes/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors duration-100"
              >
                <Plus className="h-3.5 w-3.5" /> Quote
              </Link>
            </div>
          </div>

          {/* Finance snapshot */}
          <div className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-xl bg-primary p-4 text-primary-foreground shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <Wallet className="h-4 w-4" />
                </span>
                <Link
                  href="/invoices"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-colors duration-100 hover:bg-white/25"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-foreground/70">
                Outstanding
              </p>
              <p className="mt-1 font-heading text-2xl font-semibold tracking-tight">
                ₹{outstandingTotal.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-primary-foreground/60">
                {sentInvoices.length} unpaid invoice{sentInvoices.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Overdue
              </p>
              <p className="mt-1 font-heading text-2xl font-semibold tracking-tight text-red-600">
                ₹{overdueTotal.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {overdueInvoices.length} invoice{overdueInvoices.length === 1 ? "" : "s"} unpaid 30+ days
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Collected this month
              </p>
              <p className="mt-1 font-heading text-2xl font-semibold tracking-tight text-emerald-600">
                ₹{collectedThisMonth.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {now.toLocaleString("en-IN", { month: "long" })}
              </p>
            </div>
          </div>

          {/* Task stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/tasks?status=pending" className="group rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-card-hover transition-shadow duration-100">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">Pending</span>
              </div>
              <p className="font-heading text-2xl font-semibold">{taskCounts.pending}</p>
            </Link>
            <Link href="/tasks?status=in_progress" className="group rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-card hover:shadow-card-hover transition-shadow duration-100">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <CircleDot className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">In Progress</span>
              </div>
              <p className="font-heading text-2xl font-semibold text-blue-700">{taskCounts.in_progress}</p>
            </Link>
            <Link href="/tasks?status=delayed" className="group rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-card hover:shadow-card-hover transition-shadow duration-100">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">Delayed</span>
              </div>
              <p className="font-heading text-2xl font-semibold text-red-700">{taskCounts.delayed}</p>
            </Link>
            <Link href="/tasks?status=completed" className="group rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-card hover:shadow-card-hover transition-shadow duration-100">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">Completed</span>
              </div>
              <p className="font-heading text-2xl font-semibold text-green-700">{taskCounts.completed}</p>
            </Link>
          </div>

          {/* Overdue tasks alert */}
          {overdueTasks.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-red-600">
                ⚠ Overdue Tasks ({overdueTasks.length})
              </p>
              <div className="space-y-1">
                {overdueTasks.slice(0, 5).map((t) => (
                  <Link
                    key={t.id}
                    href={`/projects/${t.project_id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-red-100/60 transition-colors duration-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-red-800">{t.title}</span>
                    <span className="shrink-0 text-[10px] text-red-500">Due {t.due_date}</span>
                    <span className="shrink-0 text-[10px] text-red-400">
                      {(t.projects as unknown as { name: string } | null)?.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Overdue invoices alert */}
          {overdueInvoices.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-red-600">
                ⚠ Overdue Invoices ({overdueInvoices.length})
              </p>
              <div className="space-y-1">
                {overdueInvoices.slice(0, 5).map((d) => (
                  <Link
                    key={d.id}
                    href={`/invoices/${d.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-red-100/60 transition-colors duration-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-red-800">
                      {d.number} · {d.project_name || "Untitled"}
                    </span>
                    <span className="shrink-0 text-[10px] text-red-500">
                      ₹{(d.total ?? 0).toLocaleString("en-IN")}
                    </span>
                    <span className="shrink-0 text-[10px] text-red-400">
                      Sent {new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            {/* Active Projects */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Active Projects
                </h3>
                <Link href="/projects" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  View all
                </Link>
              </div>
              {!recentProjects?.length ? (
                <EmptyState icon={FileText} text="No active projects" />
              ) : (
                <div className="space-y-1">
                  {recentProjects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-3 rounded-lg p-3 transition-colors duration-100 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{p.name}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {(p.clients as unknown as { name: string } | null)?.name ?? "No client"}
                          {p.type === "retainer" ? " · Retainer" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">
                        Active
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Quotes */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Recent Quotes
                </h3>
                <Link href="/quotes" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  View all
                </Link>
              </div>
              {!recentQuotes?.length ? (
                <EmptyState icon={FileText} text="No quotes yet" />
              ) : (
                <div className="space-y-1">
                  {recentQuotes.map((q) => (
                    <Link
                      key={q.id}
                      href={`/quotes/${q.id}`}
                      className="flex items-center gap-3 rounded-lg p-3 transition-colors duration-100 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {q.number} · {q.project_name || "Untitled"}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] capitalize text-muted-foreground">
                          {q.status}
                        </p>
                      </div>
                      <p className="font-heading text-xs font-medium">₹{(q.total ?? 0).toLocaleString("en-IN")}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Clients */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Recent Clients
                </h3>
                <Link href="/clients" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  View all
                </Link>
              </div>
              {!recentClients?.length ? (
                <EmptyState icon={Users} text="No clients yet" />
              ) : (
                <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
                  {recentClients.map((c) => (
                    <Link
                      key={c.id}
                      href={`/clients/${c.id}`}
                      className="flex flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors duration-100 hover:bg-muted/60"
                    >
                      <ClientAvatar name={c.name} avatarUrl={c.avatar_url} size="md" />
                      <div className="min-w-0 w-full">
                        <p className="truncate text-xs font-medium">{c.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{c.city || "—"}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Profit Margin */}
            {showMargin && (
              <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
                    Profit Margin
                  </h3>
                  <Link href="/reports/pnl" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    View P&L
                  </Link>
                </div>
                {monthRevenue === 0 ? (
                  <EmptyState icon={PieChart} text="No paid work yet this month" />
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
                    <div className="relative h-28 w-28 shrink-0">
                      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="10" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={marginPct >= 0 ? "var(--primary)" : "#e5484d"}
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={`${marginDash} ${marginCircumference}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`font-heading text-xl font-semibold tracking-tight ${marginPct < 0 ? "text-red-600" : ""}`}>
                          {marginPct}%
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground">margin</span>
                      </div>
                    </div>
                    <div className="w-full min-w-0 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-primary" />
                          Revenue
                        </span>
                        <span className="font-medium">₹{monthRevenue.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                          Cost
                        </span>
                        <span className="font-medium">₹{Math.round(monthCost).toLocaleString("en-IN")}</span>
                      </div>
                      <p className="pt-1 text-[10px] text-muted-foreground">
                        {`${now.toLocaleString("en-IN", { month: "long" })} · paid & accepted docs`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border py-6 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground/50" />
      <p className="mt-2 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
