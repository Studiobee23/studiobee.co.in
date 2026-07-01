import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isBillingRole, canSeeCost } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDocumentForViewer } from "@/lib/actions/documents";
import { QuoteEditor } from "../quote-editor";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const { id } = await params;
  const doc = await getDocumentForViewer(id);
  if (!doc || doc.type !== "quote") notFound();

  const supabase = await createClient();
  const seeCost = canSeeCost(profile.role);

  const [{ data: clients }, { data: presets }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("service_presets").select("*").order("category"),
  ]);

  let roles: { id: string; name: string; hourly_rate: number }[] = [];
  let overheads: { id: string; name: string; cost: number }[] = [];
  if (seeCost) {
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from("cost_roles").select("id, name, hourly_rate").eq("active", true),
      supabase.from("overhead_items").select("id, name, cost").eq("active", true),
    ]);
    roles = r ?? [];
    overheads = o ?? [];
  } else {
    const admin = createAdminClient();
    const [{ data: r }, { data: o }] = await Promise.all([
      admin.from("cost_roles").select("id, name").eq("active", true),
      admin.from("overhead_items").select("id, name").eq("active", true),
    ]);
    roles = (r ?? []).map((x) => ({ ...x, hourly_rate: 0 }));
    overheads = (o ?? []).map((x) => ({ ...x, cost: 0 }));
  }

  return (
    <>
      <DashboardHeader title={doc.number} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-3xl">
          <QuoteEditor
            clients={clients ?? []}
            presets={presets ?? []}
            roles={roles}
            overheads={overheads}
            canSeeCost={seeCost}
            doc={{
              id: doc.id,
              number: doc.number,
              status: doc.status,
              client_id: doc.client_id,
              project_name: doc.project_name,
              category: doc.category,
              line_items: doc.line_items ?? [],
              gst_enabled: doc.gst_enabled,
              gst_type: doc.gst_type,
              gst_rate: doc.gst_rate,
              discount: doc.discount,
              notes: doc.notes,
              validity_days: doc.validity_days,
            }}
          />
        </div>
      </div>
    </>
  );
}
