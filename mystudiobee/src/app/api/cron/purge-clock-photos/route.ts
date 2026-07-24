import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PHOTO_RETENTION_DAYS = 30;

/** Daily Vercel Cron: deletes clock-in selfie images older than 30 days.
 * Only clears clock_in_photo_path — clocked_in_at/clocked_out_at/location stay
 * on the row indefinitely for payroll. Runs via the service-role client because
 * a plain SQL delete against storage.objects doesn't reliably remove the
 * underlying file; this goes through the real Storage API instead. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error: selectError } = await supabase
    .from("time_entries")
    .select("id, clock_in_photo_path")
    .not("clock_in_photo_path", "is", null)
    .lt("clocked_in_at", cutoff);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }
  if (!expired || expired.length === 0) {
    return NextResponse.json({ purged: 0 });
  }

  const paths = expired.map((e) => e.clock_in_photo_path as string);
  const { error: removeError } = await supabase.storage.from("clock-in-selfies").remove(paths);
  if (removeError) {
    return NextResponse.json({ error: removeError.message }, { status: 500 });
  }

  const ids = expired.map((e) => e.id);
  const { error: updateError } = await supabase
    .from("time_entries")
    .update({ clock_in_photo_path: null })
    .in("id", ids);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ purged: ids.length });
}
