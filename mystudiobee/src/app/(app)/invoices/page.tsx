import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DocumentList } from "@/components/documents/document-list";
import { getCurrentProfile, isBillingRole, canSeeCost } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function InvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("documents")
    .select("id, number, project_name, status, total, clients(name)")
    .eq("type", "invoice")
    .order("created_at", { ascending: false });

  return (
    <>
      <DashboardHeader title="Invoices" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-5xl">
          <DocumentList
            docs={invoices ?? []}
            basePath="/invoices"
            emptyText="No invoices yet — convert a quote to create one."
            canDelete={canSeeCost(profile.role)}
          />
        </div>
      </div>
    </>
  );
}
