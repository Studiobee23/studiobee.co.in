import Link from "next/link";
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    redirect("/");
  }

  return (
    <>
      <DashboardHeader title="Reports" />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <Link
            href="/reports/pnl"
            className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40 transition-colors"
          >
            <p className="font-heading text-lg font-semibold">P&L Report</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Revenue, costs, and profit per invoice or receipt.
            </p>
          </Link>
          <Link
            href="/reports/hours"
            className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40 transition-colors"
          >
            <p className="font-heading text-lg font-semibold">Hours Report</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Estimated vs consumed hours per project.
            </p>
          </Link>
        </div>
      </div>
    </>
  );
}
