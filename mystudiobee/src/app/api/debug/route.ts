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

  return NextResponse.json({
    uid: userData.user.id,
    profile,
    clientsAdmin,
    clientsUser,
    clientsError: clientsError?.message,
  });
}
