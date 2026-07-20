"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";

async function requireBillingRole() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) {
    throw new Error("Not authorized.");
  }
  return profile;
}

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    throw new Error("Only owner/admin can delete or restore clients.");
  }
  return profile;
}

function revalidateAffectedPaths() {
  for (const path of [
    "/",
    "/clients",
    "/projects",
    "/tasks",
    "/quotes",
    "/proformas",
    "/invoices",
    "/receipts",
    "/bin",
    "/reports/pnl",
    "/reports/time",
    "/reports/hours",
    "/clock",
  ]) {
    try { revalidatePath(path); } catch { /* ignore */ }
  }
}

export type ClientInput = {
  id?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
  tags?: string[];
  lead_source?: string;
};

export async function upsertClient(input: ClientInput) {
  const profile = await requireBillingRole().catch((e) => { throw new Error("requireBillingRole: " + String(e)); });
  const supabase = await createClient();

  const payload = {
    name: input.name,
    contact_person: input.contact_person ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    gstin: input.gstin ?? "",
    address: input.address ?? "",
    city: input.city ?? "",
    state: input.state ?? "",
    notes: input.notes ?? "",
    tags: input.tags ?? [],
    lead_source: input.lead_source ?? "",
  };

  const { data, error } = input.id
    ? await supabase.from("clients").update(payload).eq("id", input.id).select("id").single()
    : await supabase
        .from("clients")
        .insert({ ...payload, created_by: profile?.id ?? null })
        .select("id")
        .single();

  if (error) throw new Error("DB error: " + error.message + " code:" + error.code);
  if (!data) throw new Error("Insert/update returned no data — possible RLS SELECT block after write");
  try { revalidatePath("/clients"); } catch { /* ignore */ }
  return data.id as string;
}

/** Soft-deletes a client and every project/document/task/etc. under it.
 * Recoverable from /bin for 30 days, after which pg_cron purges it for good. */
export async function deleteClient(id: string) {
  await requireOwnerOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_client", { p_client_id: id });
  if (error) throw new Error(error.message);
  revalidateAffectedPaths();
}

export async function restoreClient(id: string) {
  await requireOwnerOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_client", { p_client_id: id });
  if (error) throw new Error(error.message);
  revalidateAffectedPaths();
}

export type BinnedClient = {
  id: string;
  name: string;
  city: string;
  deleted_at: string;
};

export async function listBinnedClients(): Promise<BinnedClient[]> {
  await requireOwnerOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, city, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BinnedClient[];
}
