import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { sumLaborCost, sumDirectCost } from "@/lib/profit-split/engine";

export default async function PnlReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: allDocs } = await supabase
    .from("documents")
    .select("id, type, number, project_name, project_id, status, total, subtotal, line_items, created_at, clients(name)")
    .in("type", ["invoice", "receipt"])
    .in("status", ["paid", "accepted"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const years = Array.from(
    new Set((allDocs ?? []).map((d) => new Date(d.created_at).getFullYear()))
  ).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.unshift(currentYear);

  const { year: yearParam } = await searchParams;
  const selectedYear = yearParam && yearParam !== "all" ? Number(yearParam) : null;

  const docs = selectedYear
    ? (allDocs ?? []).filter((d) => new Date(d.created_at).getFullYear() === selectedYear)
    : (allDocs ?? []);

  const projectIds = [...new Set(docs.map((d) => d.project_id).filter(Boolean))];

  const { data: expenseRows } = projectIds.length
    ? await supabase
        .from("project_expenses")
        .select("project_id, amount, gst_amount")
        .in("project_id", projectIds)
    : { data: [] };

  const expensesByProject: Record<string, number> = {};
  for (const e of expenseRows ?? []) {
    if (!e.project_id) continue;
    expensesByProject[e.project_id] = (expensesByProject[e.project_id] ?? 0) + (e.amount ?? 0) + (e.gst_amount ?? 0);
  }

  // Apportion project expenses evenly across paid docs per project
  const docsPerProject: Record<string, number> = {};
  for (const d of docs) {
    if (d.project_id) docsPerProject[d.project_id] = (docsPerProject[d.project_id] ?? 0) + 1;
  }

  const rows = docs.map((d) => {
    const items = (d.line_items ?? []) as Array<{ cost_breakdown: unknown }>;
    const labor = sumLaborCost(items);
    const direct = sumDirectCost(items);
    const revenue = d.total ?? 0;
    const projectExpenseShare = d.project_id
      ? (expensesByProject[d.project_id] ?? 0) / (docsPerProject[d.project_id] ?? 1)
      : 0;
    const cost = labor + direct + projectExpenseShare;
    const profit = revenue - cost;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    return { ...d, revenue, labor, direct, projectExpenseShare, cost, profit, margin };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      expenses: acc.expenses + r.projectExpenseShare,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, cost: 0, expenses: 0, profit: 0 }
  );

  // Recurring/amortized internal costing items (subscriptions, amortized purchases
  // like laptops, etc.) apply company-wide, not per-document — deduct them separately
  // so "Net Profit" reflects true profitability, not just gross margin on billed work.
  // Per-project items are excluded: their cost is already captured on the documents
  // that use them.
  const { data: monthlyOverheads } = await supabase
    .from("overhead_items")
    .select("id, name, cost")
    .in("costing_type", ["recurring", "purchase"])
    .eq("active", true);

  const monthsInPeriod = selectedYear
    ? selectedYear === currentYear
      ? new Date().getMonth() + 1
      : 12
    : 12; // "All time" shows a single year's worth as a rough baseline
  const monthlyOverheadTotal = (monthlyOverheads ?? []).reduce((s, o) => s + o.cost, 0);
  const overheadTotal = monthlyOverheadTotal * monthsInPeriod;
  const netProfitAfterOverhead = totals.profit - overheadTotal;

  return (
    <>
      <DashboardHeader title="P&L Report" backHref="/reports">
        <div className="flex gap-1">
          {["all", ...years.map(String)].map((y) => (
            <Link
              key={y}
              href={y === "all" ? "/reports/pnl" : `/reports/pnl?year=${y}`}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                (yearParam ?? "all") === y
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {y === "all" ? "All time" : y}
            </Link>
          ))}
        </div>
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Revenue", value: totals.revenue },
            { label: "Production Cost", value: totals.cost - totals.expenses },
            { label: "Project Expenses", value: totals.expenses },
            { label: `Overheads (${monthsInPeriod}mo)`, value: overheadTotal },
            { label: "Net Profit", value: netProfitAfterOverhead },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`font-heading text-xl font-semibold ${s.label === "Net Profit" && s.value < 0 ? "text-red-600" : ""}`}>
                ₹{Math.round(s.value).toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
        {monthlyOverheadTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            Based on ₹{monthlyOverheadTotal.toLocaleString("en-IN")}/month in active overheads
            ({(monthlyOverheads ?? []).map((o) => o.name).join(", ")}) × {monthsInPeriod} month{monthsInPeriod !== 1 ? "s" : ""}.
          </p>
        )}

        <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Document", "Client / Project", "Revenue", "Labor", "Direct", "Proj. Expenses", "Net Profit", "Margin"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No paid invoices or receipts {selectedYear ? `in ${selectedYear}` : "yet"}.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="bg-card hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(r.clients as unknown as { name: string } | null)?.name ?? r.project_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">₹{r.revenue.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">₹{r.labor.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">₹{r.direct.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.projectExpenseShare > 0 ? `₹${Math.round(r.projectExpenseShare).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className={`px-4 py-3 font-medium ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ₹{Math.round(r.profit).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">{r.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
