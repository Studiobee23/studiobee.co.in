"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isBillingRole, canSeeCost } from "@/lib/profile";
import { computeCostBreakdown, priceFromBreakdown, redactCostBreakdown } from "@/lib/costing/engine";
import type { LineItemCostInput, LineItem } from "@/lib/costing/types";

async function requireBillingRole() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) throw new Error("Not authorized.");
  return profile;
}

const DOC_PREFIX = { quote: "SB-Q", invoice: "SB-I", receipt: "SB-R" } as const;
const NEXT_TYPE = { quote: "invoice", invoice: "receipt" } as const;

async function nextDocNumber(type: "quote" | "invoice" | "receipt") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("increment_doc_series", { series_type: type });
  if (error) throw new Error(error.message);
  return `${DOC_PREFIX[type]}-${String(data).padStart(3, "0")}`;
}

/**
 * Resolves a service preset (or a manual cost input) into a priced line item.
 * Runs server-side with the admin client so `cost_roles`/`overhead_items` rows are
 * never sent to a manager's browser — only the resulting description/rate/amount.
 */
export async function priceLineItem(input: {
  description: string;
  qty: number;
  cost: LineItemCostInput;
}): Promise<LineItem> {
  await requireBillingRole();
  const admin = createAdminClient();

  const [{ data: roles }, { data: overheads }] = await Promise.all([
    admin.from("cost_roles").select("id, name, hourly_rate"),
    admin.from("overhead_items").select("id, name, cost, type"),
  ]);

  const breakdown = computeCostBreakdown(input.cost, roles ?? [], overheads ?? []);
  const rate = priceFromBreakdown(breakdown);

  return {
    description: input.description,
    qty: input.qty,
    cost_breakdown: breakdown,
    rate,
    amount: Math.round(rate * input.qty * 100) / 100,
  };
}

export async function createQuote(input: {
  client_id: string;
  project_name: string;
  category: string;
  line_items: LineItem[];
  subtotal: number;
  gst_enabled: boolean;
  gst_type: "cgst_sgst" | "igst";
  gst_rate: number;
  gst_amount: number;
  discount: number;
  total: number;
  notes: string;
  validity_days: number;
  project_id?: string | null;
  executor_id?: string | null;
  manager_id?: string | null;
  client_handler_id?: string | null;
  profit_split?: unknown;
}) {
  const profile = await requireBillingRole();
  const supabase = await createClient();
  const number = await nextDocNumber("quote");

  const { data, error } = await supabase
    .from("documents")
    .insert({ ...input, type: "quote", number, status: "draft", created_by: profile.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/quotes");
  return data.id as string;
}

export async function updateDocument(
  id: string,
  input: Partial<{
    client_id: string;
    status: string;
    project_name: string;
    category: string;
    line_items: LineItem[];
    subtotal: number;
    gst_enabled: boolean;
    gst_type: "cgst_sgst" | "igst";
    gst_rate: number;
    gst_amount: number;
    discount: number;
    total: number;
    notes: string;
    validity_days: number;
    project_id: string | null;
    executor_id: string | null;
    manager_id: string | null;
    client_handler_id: string | null;
    profit_split: unknown;
  }>,
) {
  await requireBillingRole();
  const supabase = await createClient();
  const { error } = await supabase.from("documents").update(input).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/receipts");
}

export async function convertDocument(id: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data: src, error: fetchError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error("Document not found.");

  const nextType = NEXT_TYPE[src.type as "quote" | "invoice"];
  if (!nextType) throw new Error("Receipts can't be converted further.");

  const number = await nextDocNumber(nextType);
  const { id: _id, created_at: _ca, updated_at: _ua, number: _num, type: _type, status: _st, converted_from: _cf, ...rest } = src;

  const { data, error } = await supabase
    .from("documents")
    .insert({ ...rest, type: nextType, number, status: "draft", converted_from: id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/receipts");
  return { id: data.id as string, type: nextType };
}

/** Fetch a document, redacting cost_breakdown from line items for manager-role sessions. */
export async function getDocumentForViewer(id: string) {
  const profile = await requireBillingRole();
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").select("*, clients(*)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  if (!canSeeCost(profile.role)) {
    const { executor_id: _e, manager_id: _m, client_handler_id: _ch, profit_split: _ps, ...rest } = data as Record<string, unknown>;
    return { ...rest, line_items: redactCostBreakdown(data.line_items ?? []) };
  }
  return data;
}
