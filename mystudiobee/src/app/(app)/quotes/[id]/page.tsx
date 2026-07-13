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

  const [{ data: clients }, { data: presets }, { data: equipmentItems }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("id, name, email").order("name"),
    supabase.from("service_presets").select("*").order("category"),
    supabase.from("equipment").select("id, name, daily_rental_cost, weekly_rental_cost").eq("active", true).order("name"),
    supabase.from("projects").select("id, name, client_id").order("name"),
  ]);

  let roles: { id: string; name: string; hourly_rate: number }[] = [];
  let overheads: { id: string; name: string; cost: number }[] = [];
  let teamMembers: { id: string; display_name: string; email: string; role: string }[] = [];
  let splitSettings: unknown[] = [];

  if (seeCost) {
    const admin = createAdminClient();
    const [{ data: r }, { data: o }, { data: tm }, { data: ss }] = await Promise.all([
      supabase.from("cost_roles").select("id, name, hourly_rate").eq("active", true),
      supabase.from("overhead_items").select("id, name, cost").eq("active", true),
      admin.from("profiles").select("id, display_name, email, role").eq("active", true).order("display_name"),
      admin.from("profit_split_settings").select("*").order("category"),
    ]);
    roles = r ?? [];
    overheads = o ?? [];
    teamMembers = tm ?? [];
    splitSettings = ss ?? [];
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
      <DashboardHeader title={doc.number} backHref="/quotes" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-3xl">
          <QuoteEditor
            clients={clients ?? []}
            presets={presets ?? []}
            roles={roles}
            overheads={overheads}
            canSeeCost={seeCost}
            teamMembers={teamMembers}
            splitSettings={splitSettings as never}
            equipmentItems={equipmentItems ?? []}
            projects={projects ?? []}
            doc={{
              id: doc.id,
              number: doc.number,
              status: doc.status,
              client_id: doc.client_id,
              project_id: (doc as Record<string, unknown>).project_id as string | null,
              project_name: doc.project_name,
              category: doc.category,
              line_items: doc.line_items ?? [],
              gst_enabled: doc.gst_enabled,
              gst_type: doc.gst_type,
              gst_rate: doc.gst_rate,
              discount: doc.discount,
              discount_type: (doc as Record<string, unknown>).discount_type as "flat" | "percent" | undefined,
              notes: doc.notes,
              validity_days: doc.validity_days,
              executor_id: (doc as Record<string, unknown>).executor_id as string | null,
              manager_id: (doc as Record<string, unknown>).manager_id as string | null,
              client_handler_id: (doc as Record<string, unknown>).client_handler_id as string | null,
              hide_pricing: (doc as Record<string, unknown>).hide_pricing as boolean | undefined,
              summary_view: (doc as Record<string, unknown>).summary_view as boolean | undefined,
              summary_label: (doc as Record<string, unknown>).summary_label as string | null | undefined,
            }}
          />
        </div>
      </div>
    </>
  );
}
