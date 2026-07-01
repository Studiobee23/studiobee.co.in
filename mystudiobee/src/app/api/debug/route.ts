import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const admin = createAdminClient();
  const user = await createClient();

  const { data: userData } = await (await user).auth.getUser();
  const { data: clientsAdmin } = await admin.from("clients").select("id, name").limit(5);
  const { data: clientsUser, error: clientsError } = await (await user).from("clients").select("id, name").limit(5);
  const { data: profile } = await admin.from("profiles").select("id, role").eq("id", userData?.user?.id ?? "").maybeSingle();

  return NextResponse.json({
    uid: userData?.user?.id,
    profile,
    clientsAdmin,
    clientsUser,
    clientsError: clientsError?.message,
  });
}
