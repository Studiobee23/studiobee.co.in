import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { ClientsClient } from "./clients-client";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const { q, new: openNew } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select("id, name, contact_person, email, phone, city, tags")
    .is("deleted_at", null)
    .order("name");
  if (q) query = query.ilike("name", `%${q}%`);

  const { data: clients } = await query;

  return (
    <>
      <DashboardHeader title="Clients" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-5xl">
          <ClientsClient clients={clients ?? []} initialQuery={q ?? ""} openNewOnLoad={openNew === "1"} />
        </div>
      </div>
    </>
  );
}
