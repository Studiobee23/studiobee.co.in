"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { updateProject } from "@/lib/actions/projects";

type ProjectInput = {
  name: string;
  description: string;
  category: string;
  type: string;
  client_id: string;
  est_hours: number | null;
  start_date: string | null;
  end_date: string | null;
};

export function EditProjectSheet({
  open,
  onOpenChange,
  projectId,
  project,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  project: ProjectInput;
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(project);

  useEffect(() => {
    setForm(project);
  }, [project, open]);

  function set<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      try {
        await updateProject(projectId, {
          name: form.name,
          description: form.description || undefined,
          category: form.category || undefined,
          type: form.type as "project" | "retainer",
          client_id: form.client_id || undefined,
          est_hours: form.est_hours ?? undefined,
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
        });
        toast.success("Project updated");
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update project");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit project</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <Field label="Project Name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="retainer">Retainer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Client">
            <Select value={form.client_id || ""} onValueChange={(v) => set("client_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Input
              value={form.category ?? ""}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. branding, video, web"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Est. Hours">
              <Input
                type="number"
                value={form.est_hours ?? ""}
                onChange={(e) => set("est_hours", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </Field>
            <Field label="Start Date">
              <Input
                type="date"
                value={form.start_date ?? ""}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </Field>
            <Field label="End Date">
              <Input
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => set("end_date", e.target.value)}
              />
            </Field>
          </div>
        </div>
        <SheetFooter>
          <Button onClick={save} disabled={!form.name.trim() || pending}>
            {pending ? "Saving…" : "Save"}
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
