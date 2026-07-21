import { createClient } from "@/lib/supabase/client";
import { updateClientAvatar } from "@/lib/actions/clients";

export async function uploadAndSetClientAvatar(clientId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${clientId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("client-avatars")
    .upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from("client-avatars").getPublicUrl(path);
  await updateClientAvatar(clientId, data.publicUrl);
  return data.publicUrl;
}
