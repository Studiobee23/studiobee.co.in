"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientFormSheet } from "./client-form-sheet";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { uploadAndSetClientAvatar } from "@/lib/clients/avatar-upload";

type Client = {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  tags: string[];
  avatar_url: string | null;
};

export function ClientsClient({
  clients,
  initialQuery,
  openNewOnLoad,
}: {
  clients: Client[];
  initialQuery: string;
  openNewOnLoad: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(openNewOnLoad);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(q ? `/clients?q=${encodeURIComponent(q)}` : "/clients");
  }

  async function handleAvatarUpload(clientId: string, file: File) {
    setUploadingId(clientId);
    try {
      const url = await uploadAndSetClientAvatar(clientId, file);
      setAvatars((a) => ({ ...a, [clientId]: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
            className="pl-8"
          />
        </form>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add client
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        {clients.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No clients yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((c) => (
              <div
                key={c.id}
                className="relative flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-muted/50"
              >
                <Link href={`/clients/${c.id}`} className="absolute inset-0" aria-label={c.name} />
                <div className="relative z-10">
                  <ClientAvatar
                    name={c.name}
                    avatarUrl={avatars[c.id] ?? c.avatar_url}
                    size="sm"
                    editable
                    uploading={uploadingId === c.id}
                    onFileSelected={(file) => handleAvatarUpload(c.id, file)}
                  />
                </div>
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-snug">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.contact_person || c.email || c.phone || "—"} {c.city ? `· ${c.city}` : ""}
                  </p>
                </div>
                {c.tags?.length > 0 && (
                  <div className="relative z-10 flex gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ClientFormSheet
        open={open}
        onOpenChange={setOpen}
        onSaved={(id) => { setOpen(false); router.push(`/clients/${id}`); }}
      />
    </div>
  );
}
