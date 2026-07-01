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

  return NextResponse.json({
    uid: userData.user.id,
    profile,
    clientsAdmin,
    clientsUser,
    clientsError: clientsError?.message,
    insertTest: { id: insertData?.id ?? null, error: insertError?.message ?? null, code: insertError?.code ?? null },
  });
}
