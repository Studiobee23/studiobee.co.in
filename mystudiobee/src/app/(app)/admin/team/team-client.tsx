"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { inviteEmployee, updateEmployeeRole, updateEmployeeManager, setEmployeeActive, deleteEmployee } from "@/lib/actions/team";
import type { Role } from "@/lib/profile";

type Employee = { id: string; email: string; display_name: string; role: Role; active: boolean; manager_id: string | null };

const ROLES: Role[] = ["super_admin", "admin", "manager", "employee"];

const ROLE_PERMISSIONS: Record<Role, string> = {
  super_admin: "Everything admin has, plus profit-split percentages and point-reason management.",
  admin: "Full access — billing, cost visibility, admin settings, team management.",
  manager: "Clients, projects, quotes/invoices/receipts — no cost breakdowns or admin settings.",
  employee: "Tasks and Clock In only. No billing or client access.",
};

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

  async function handleDelete(emp: Employee) {
    if (
      !window.confirm(
        `Delete ${emp.display_name || emp.email}? This removes their login and profile permanently — their name will show blank on past tasks, time logs, and documents. This cannot be undone.\n\nIf they just left the team, consider deactivating instead.`
      )
    )
      return;
    try {
      await deleteEmployee(emp.id);
      toast.success("Employee deleted");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

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
                        {r.replace("_", " ")}
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
            <TableHead>Reports To</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((emp) => {
            const isSelf = emp.id === currentUserId;
            return (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">
                  {emp.display_name || "—"}
                  {isSelf && <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                <TableCell>
                  <div title={isSelf ? "You can't change your own role — ask another admin." : ROLE_PERMISSIONS[emp.role]}>
                    <Select
                      value={emp.role}
                      disabled={isSelf}
                      onValueChange={async (v) => {
                        try {
                          await updateEmployeeRole(emp.id, v as Role);
                          toast.success(`Role updated to ${v}`);
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
                          <SelectItem key={r} value={r} className="capitalize" title={ROLE_PERMISSIONS[r]}>
                            {r.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={emp.manager_id ?? "none"}
                    onValueChange={async (v) => {
                      try {
                        await updateEmployeeManager(emp.id, v === "none" ? null : v);
                        toast.success("Reports-to updated");
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to update");
                      }
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none (reports to admin) —</SelectItem>
                      {employees
                        .filter((m) => m.id !== emp.id && m.role !== "employee")
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.display_name || m.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div title={isSelf ? "You can't deactivate your own account." : emp.active ? "Deactivate to revoke access if this person leaves — their history (tasks, time logs, documents) is kept." : "Inactive — can't sign in."}>
                    <Switch
                      checked={emp.active}
                      disabled={isSelf}
                      onCheckedChange={async (v) => {
                        try {
                          await setEmployeeActive(emp.id, v);
                          toast.success(v ? "Reactivated" : "Deactivated");
                          router.refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed to update");
                        }
                      }}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {!isSelf && (
                    <button
                      onClick={() => handleDelete(emp)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="mt-3 text-[11px] text-muted-foreground">
        <strong>Super Admin:</strong> {ROLE_PERMISSIONS.super_admin} <strong>Admin:</strong> {ROLE_PERMISSIONS.admin} <strong>Manager:</strong> {ROLE_PERMISSIONS.manager} <strong>Employee:</strong> {ROLE_PERMISSIONS.employee}
      </p>
    </div>
  );
}
