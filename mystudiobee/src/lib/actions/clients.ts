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
  const profile = await requireBillingRole();
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
        .insert({ ...payload, created_by: profile.id })
        .select("id")
        .single();

  if (error) throw new Error(error.message);
  revalidatePath("/clients");
  return data.id as string;
}
