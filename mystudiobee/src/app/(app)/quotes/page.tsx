import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DocumentList } from "@/components/documents/document-list";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function QuotesPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const supabase = await createClient();
  const { data: quotes } = await supabase
    .from("documents")
    .select("id, number, project_name, status, total, clients(name)")
    .eq("type", "quote")
    .order("created_at", { ascending: false });

  return (
    <>
      <DashboardHeader title="Quotes">
        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> New quote
        </Link>
      </DashboardHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-5xl">
          <DocumentList docs={quotes ?? []} basePath="/quotes" emptyText="No quotes yet." />
        </div>
      </div>
    </>
  );
}
