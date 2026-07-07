"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertClient, type ClientInput } from "@/lib/actions/clients";

export type ClientRecord = ClientInput & { id?: string };

const LEAD_SOURCES = [
  "Referral",
  "Website",
  "Instagram",
  "LinkedIn",
  "Cold Outreach",
  "Repeat Client",
  "Walk-in",
  "Other",
];

export function ClientFormSheet({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientRecord | null;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<ClientRecord>({ name: "" });
  const [loading, setLoading] = useState(false);
  const [customLeadSource, setCustomLeadSource] = useState(false);

  useEffect(() => {
    const next = client ?? { name: "" };
    setForm(next);
    setCustomLeadSource(!!next.lead_source && !LEAD_SOURCES.includes(next.lead_source));
  }, [client, open]);

  function set<K extends keyof ClientRecord>(key: K, value: ClientRecord[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name) return;
    setLoading(true);
    try {
      const id = await upsertClient(form);
      toast.success(client?.id ? "Client updated" : "Client added");
      onOpenChange(false);
      onSaved(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{client?.id ? "Edit client" : "Add client"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Contact person">
            <Input value={form.contact_person ?? ""} onChange={(e) => set("contact_person", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <Field label="GSTIN">
            <Input value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value)} />
          </Field>
          <Field label="Address">
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State">
              <Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
            </Field>
          </div>
          <Field label="Lead source">
            <Select
              value={customLeadSource ? "Other" : form.lead_source || ""}
              onValueChange={(v) => {
                if (v === "Other") {
                  setCustomLeadSource(true);
                  set("lead_source", "");
                } else {
                  setCustomLeadSource(false);
                  set("lead_source", v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="How did they find us?" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customLeadSource && (
              <Input
                className="mt-1.5"
                placeholder="Specify lead source…"
                value={form.lead_source ?? ""}
                onChange={(e) => set("lead_source", e.target.value)}
              />
            )}
          </Field>
          <Field label="Tags (comma separated)">
            <Input
              value={(form.tags ?? []).join(", ")}
              onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
            />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </div>
        <SheetFooter>
          <Button onClick={handleSave} disabled={!form.name || loading}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
