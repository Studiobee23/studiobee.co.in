import { createClient } from "@/lib/supabase/client";

/** Uploads a clock-in selfie to the private clock-in-selfies bucket and returns
 * its storage path (not a public URL — the bucket is private, callers/managers
 * view it via a signed URL generated server-side). Path has no dependency on a
 * time_entries row existing yet, since the entry isn't inserted until after this
 * upload succeeds. */
export async function uploadClockPhoto(employeeId: string, blob: Blob): Promise<string> {
  const supabase = createClient();
  const path = `${employeeId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from("clock-in-selfies")
    .upload(path, blob, { upsert: false, contentType: "image/jpeg" });
  if (error) throw new Error(error.message);

  return path;
}
