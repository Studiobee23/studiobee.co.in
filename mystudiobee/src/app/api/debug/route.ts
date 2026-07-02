import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Temporary diagnostic route — owner-only, will be deleted after diagnosis
export async function GET() {
  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return new NextResponse("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { data: clientsAdmin } = await admin.from("clients").select("id, name").limit(5);
  const { data: clientsUser, error: clientsError } = await userClient.from("clients").select("id, name").limit(5);

  // Test insert via user client to surface exact DB error
  const { data: insertData, error: insertError } = await userClient
    .from("clients")
    .insert({
      name: "__debug_test__",
      contact_person: "",
      email: "",
      phone: "",
      gstin: "",
      address: "",
      city: "",
      state: "",
      notes: "",
      tags: ["test"],
      lead_source: "",
      created_by: userData.user.id,
    })
    .select("id")
    .single();

  // Immediately delete if it succeeded
  if (insertData?.id) {
    await userClient.from("clients").delete().eq("id", insertData.id);
  }

  // Test documents table columns
  const { data: docCols, error: docColsError } = await admin
    .from("documents")
    .select("id, type, number, status, client_id, project_name, category, line_items, subtotal, gst_enabled, gst_type, gst_rate, gst_amount, discount, total, notes, validity_days, project_id, executor_id, manager_id, client_handler_id, profit_split, created_by")
    .limit(1);

  // Test tasks table columns
  const { data: taskCols, error: taskColsError } = await admin
    .from("tasks")
    .select("id, project_id, title, status, due_date, assigned_to, created_by")
    .limit(1);

  // Test tasks+profiles join exactly as page.tsx does
  const { data: tasksJoin, error: tasksJoinError } = await admin
    .from("tasks")
    .select("*, profiles!assigned_to(display_name, email)")
    .limit(1);

  // Test profiles columns
  const { data: profileCols, error: profileColsError } = await admin
    .from("profiles")
    .select("id, display_name, email, role")
    .limit(1);

  // Test increment_doc_series RPC
  const { error: rpcError } = await userClient.rpc("increment_doc_series", { series_type: "quote" });
  // If it worked, decrement it back (not critical for diagnostics)

  // Debug: check receipts and their created_by
  const { data: receipts } = await admin.from("documents").select("id, number, status, created_by").eq("type", "receipt");

  // Debug: try the updateDocumentStatus pattern via user client
  const testReceiptId = receipts?.[0]?.id;
  let updateTest = null;
  if (testReceiptId) {
    const { data: ud, error: ue } = await userClient
      .from("documents")
      .update({ status: "draft" })
      .eq("id", testReceiptId)
      .eq("created_by", userData.user.id)
      .select("id");
    updateTest = { id: ud?.[0]?.id ?? null, error: ue?.message ?? null };
  }

  return NextResponse.json({
    uid: userData.user.id,
    profile,
    clientsAdmin,
    clientsUser,
    clientsError: clientsError?.message,
    insertTest: { id: insertData?.id ?? null, error: insertError?.message ?? null, code: insertError?.code ?? null },
    documentsColTest: { ok: !docColsError, error: docColsError?.message ?? null },
    tasksColTest: { ok: !taskColsError, error: taskColsError?.message ?? null },
    tasksJoinTest: { ok: !tasksJoinError, error: tasksJoinError?.message ?? null, rowCount: tasksJoin?.length ?? 0 },
    profileColsTest: { ok: !profileColsError, error: profileColsError?.message ?? null },
    rpcTest: { ok: !rpcError, error: rpcError?.message ?? null },
    receipts,
    updateTest,
  });
}
