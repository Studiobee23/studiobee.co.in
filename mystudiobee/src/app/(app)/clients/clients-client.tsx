"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientFormSheet } from "./client-form-sheet";

type Client = {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  tags: string[];
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(q ? `/clients?q=${encodeURIComponent(q)}` : "/clients");
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
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.contact_person || c.email || c.phone || "—"} {c.city ? `· ${c.city}` : ""}
                  </p>
                </div>
                {c.tags?.length > 0 && (
                  <div className="flex gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <ClientFormSheet
        open={open}
        onOpenChange={setOpen}
        onSaved={(id) => router.push(`/clients/${id}`)}
      />
    </div>
  );
}
