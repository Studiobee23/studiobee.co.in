"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteEmployee, updateEmployeeRole, setEmployeeActive } from "@/lib/actions/team";
import type { Role } from "@/lib/profile";

type Employee = { id: string; email: string; display_name: string; role: Role; active: boolean };

const ROLES: Role[] = ["owner", "admin", "manager", "employee"];

export function TeamClient({
  employees,
  currentUserId,
}: {
  employees: Employee[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [loading, setLoading] = useState(false);

  async function handleInvite() {
    setLoading(true);
    try {
      await inviteEmployee({ email, role });
      toast.success(`Invite sent to ${email}`);
      setOpen(false);
      setEmail("");
      setRole("employee");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
          Employees
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" /> Invite employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studiobee.ai" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleInvite} disabled={!email || loading}>
                {loading ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((emp) => {
            const isSelf = emp.id === currentUserId;
            return (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.display_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                <TableCell>
                  <Select
                    value={emp.role}
                    disabled={isSelf}
                    onValueChange={async (v) => {
                      try {
                        await updateEmployeeRole(emp.id, v as Role);
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to update role");
                      }
                    }}
                  >
                    <SelectTrigger className="w-32 capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={emp.active}
                    disabled={isSelf}
                    onCheckedChange={async (v) => {
                      try {
                        await setEmployeeActive(emp.id, v);
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to update");
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
