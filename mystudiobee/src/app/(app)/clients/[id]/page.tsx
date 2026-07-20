import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ClientDetailClient } from "./client-detail-client";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: documents }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("documents")
      .select("id, type, number, project_name, status, total, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!client) notFound();

  const canDelete = profile.role === "owner" || profile.role === "admin";

  return (
    <>
      <DashboardHeader title={client.name} backHref="/clients" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-4xl">
          <ClientDetailClient
            client={client}
            documents={documents ?? []}
            canDelete={canDelete}
            isBinned={!!client.deleted_at}
            deletedAt={client.deleted_at}
          />
        </div>
      </div>
    </>
  );
}
