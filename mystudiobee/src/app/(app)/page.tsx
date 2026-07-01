import Link from "next/link";
import { FileText, Users, Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (!isBillingRole(profile.role)) {
    return (
      <>
        <DashboardHeader title="Dashboard" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="animate-in-page mx-auto max-w-2xl space-y-2 pt-10 text-center">
            <h2 className="font-heading text-lg font-semibold">
              Welcome, {profile.display_name || profile.email}
            </h2>
            <p className="text-sm text-muted-foreground">
              Your account doesn&apos;t have access to any modules yet. Check back soon.
            </p>
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: recentClients }, { data: recentQuotes }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, city, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id, number, project_name, status, total, created_at")
      .eq("type", "quote")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <>
      <DashboardHeader title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-6xl space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Welcome back, {profile.display_name || profile.email}
            </h2>
            <div className="flex gap-2">
              <Link
                href="/clients?new=1"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-card hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" /> Client
              </Link>
              <Link
                href="/quotes/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" /> Quote
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Recent Clients
                </h3>
                <Link
                  href="/clients"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  View all
                </Link>
              </div>
              {!recentClients?.length ? (
                <EmptyState icon={Users} text="No clients yet" />
              ) : (
                <div className="space-y-1">
                  {recentClients.map((c) => (
                    <Link
                      key={c.id}
                      href={`/clients/${c.id}`}
                      className="flex items-center gap-3 rounded-lg p-3 transition-all hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{c.name}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {c.city || "—"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Recent Quotes
                </h3>
                <Link
                  href="/quotes"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
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
                      className="flex items-center gap-3 rounded-lg p-3 transition-all hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {q.number} · {q.project_name || "Untitled"}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] capitalize text-muted-foreground">
                          {q.status}
                        </p>
                      </div>
                      <p className="font-heading text-xs font-medium">₹{q.total ?? 0}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
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
