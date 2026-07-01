import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { sumLaborCost, sumDirectCost } from "@/lib/profit-split/engine";

export default async function PnlReportPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, type, number, project_name, status, total, subtotal, line_items, clients(name)")
    .in("type", ["invoice", "receipt"])
    .in("status", ["paid", "accepted"])
    .order("created_at", { ascending: false });

  const rows = (docs ?? []).map((d) => {
    const items = (d.line_items ?? []) as Array<{ cost_breakdown: unknown }>;
    const labor = sumLaborCost(items);
    const direct = sumDirectCost(items);
    const revenue = d.total ?? 0;
    const cost = labor + direct;
    const profit = revenue - cost;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    return { ...d, labor, direct, cost, profit, margin };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <>
      <DashboardHeader title="P&L Report" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Revenue", value: totals.revenue },
            { label: "Cost", value: totals.cost },
            { label: "Profit", value: totals.profit },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`font-heading text-xl font-semibold ${s.label === "Profit" && s.value < 0 ? "text-red-600" : ""}`}>
                ₹{s.value.toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Document", "Client / Project", "Revenue", "Labor Cost", "Direct Cost", "Profit", "Margin"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No paid invoices or receipts yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="bg-card hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(r.clients as { name: string } | null)?.name ?? r.project_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">₹{r.revenue.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">₹{r.labor.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">₹{r.direct.toLocaleString("en-IN")}</td>
                  <td
                    className={`px-4 py-3 font-medium ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    ₹{r.profit.toLocaleString("en-IN")}
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
