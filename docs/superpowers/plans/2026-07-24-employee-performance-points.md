# Employee Performance Points + Super Admin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `super_admin` role (strict superset of `admin`), a manual employee point/accountability log gated by a new manager→employee `manager_id` relationship, and relocate the profit-split percentage editor into a new role-adaptive `/performance` page, restricted to `super_admin`.

**Architecture:** One additive Postgres migration adds the role tier, `manager_id`, and two new RLS-protected tables (`point_reasons`, `point_events`). All ~20 existing inline `role !== "admin"` checks are consolidated into two shared helpers in `profile.ts` (`isAdminTier`, `isSuperAdmin`) so the next role-tier change is a small diff, not a file-by-file sweep. A single role-adaptive Next.js route (`/performance`) renders different content per role, reusing the app's existing server-action + RLS defense-in-depth pattern.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS + `@supabase/ssr`), TypeScript, Vitest.

## Global Constraints

- Role hierarchy: `super_admin` > `admin` > `manager` > `employee`. `super_admin` has every `admin` permission plus two exclusives: profit-split % editing, point-reasons management.
- `manager_id` is nullable on `profiles`; null means "reports to admin" (no specific manager can log points for them, only admin-tier).
- Point events are **manual only** — no automated lateness/schedule detection.
- `point_events.points` is **snapshotted** at log time from `point_reasons.points` — editing a reason later never rewrites history.
- Score is an **all-time running total** (`sum(points)`), computed on read — no stored/cached total column.
- Employees see **only their own** point history — no cross-employee leaderboard.
- Managers can log/edit/delete points **only for their own direct reports** (`profiles.manager_id = auth.uid()`); edits/deletes of their own logged events have no time limit. Admin/super_admin can log/edit/delete for anyone.
- The performance roster (scores table) covers `role = 'employee'` profiles only — managers/admins are not tracked by this system in v1.
- All new tables get RLS (defense-in-depth), matching every existing table in this schema — no app-layer-only enforcement.
- Every new mutation in `performance.ts` uses the regular RLS-respecting `createClient()`, not the service-role `createAdminClient()` — RLS is the actual enforcement, app-layer checks exist only for a clean error message.
- Spec reference: `docs/superpowers/specs/2026-07-24-employee-performance-points-design.md`.

---

## File Structure

**New files:**
- `mystudiobee/supabase/migrations/0032_employee_performance_points.sql`
- `mystudiobee/src/lib/profile.test.ts`
- `mystudiobee/src/lib/performance/types.ts`
- `mystudiobee/src/lib/actions/performance.ts`
- `mystudiobee/src/app/(app)/performance/page.tsx`
- `mystudiobee/src/app/(app)/performance/performance-client.tsx`
- `mystudiobee/src/app/(app)/performance/my-history.tsx`
- `mystudiobee/src/app/(app)/performance/team-scores.tsx`
- `mystudiobee/src/app/(app)/performance/point-reasons-tab.tsx`
- `mystudiobee/src/app/(app)/performance/profit-split-tab.tsx` (adapted from the deleted `profit-split-client.tsx`)

**Modified files:**
- `mystudiobee/src/lib/profile.ts`
- `mystudiobee/src/lib/supabase/proxy.ts`
- `mystudiobee/src/components/layout/app-sidebar.tsx`
- `mystudiobee/src/lib/actions/{team,cost-model,vendors,hires,equipment,clients,documents,time,profit-split}.ts`
- `mystudiobee/src/app/(app)/bin/page.tsx`
- `mystudiobee/src/app/(app)/clients/[id]/page.tsx`
- `mystudiobee/src/app/(app)/admin/team/page.tsx`
- `mystudiobee/src/app/(app)/admin/team/team-client.tsx`
- `mystudiobee/src/app/(app)/admin/{services,cost-model,equipment,vendors,hires}/page.tsx`
- `mystudiobee/src/app/(app)/reports/page.tsx`
- `mystudiobee/src/app/(app)/reports/pnl/page.tsx`
- `mystudiobee/src/app/(app)/reports/hours/page.tsx`

**Deleted files:**
- `mystudiobee/src/app/(app)/admin/profit-split/page.tsx`
- `mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx`

---

### Task 1: Database migration — super_admin role, manager_id, point tables

**Files:**
- Create: `mystudiobee/supabase/migrations/0032_employee_performance_points.sql`

**Interfaces:**
- Produces: `profiles.manager_id` column; `profiles.role` accepts `'super_admin'`; SQL functions `is_owner_or_admin()` (now admin-or-above), `is_billing_role()`, `is_super_admin()` (new); tables `point_reasons(id, label, points, active, created_at)`, `point_events(id, employee_id, reason_id, points, note, logged_by, created_at, updated_at)`.

- [ ] **Step 1: Write the migration file**

```sql
-- Employee performance points + super_admin role
-- See docs/superpowers/specs/2026-07-24-employee-performance-points-design.md

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'employee'));

alter table profiles add column if not exists manager_id uuid references profiles(id) on delete set null;

-- arora.nikhil is the first super_admin; the other 2 existing profiles stay admin.
update profiles set role = 'super_admin' where email = 'arora.nikhil@studiobee.co.in';

-- Name kept from the pre-merge role model (referenced by ~15 existing policies by
-- name) — now means "admin or above".
create or replace function is_owner_or_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select current_profile_role() in ('admin', 'super_admin');
$$;

create or replace function is_billing_role()
returns boolean
language sql stable security definer set search_path = public
as $$
  select current_profile_role() in ('admin', 'super_admin', 'manager');
$$;

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select current_profile_role() = 'super_admin';
$$;

-- Narrow profit_split_settings to super_admin at the DB layer (was admin-only).
drop policy if exists "owner/admin manage profit_split_settings" on profit_split_settings;
create policy "super_admin manages profit_split_settings" on profit_split_settings
  for all using (is_super_admin()) with check (is_super_admin());

create table point_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  points integer not null,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table point_reasons enable row level security;

create policy "any active profile reads point_reasons" on point_reasons
  for select using (exists (select 1 from profiles where id = auth.uid() and active));
create policy "super_admin manages point_reasons" on point_reasons
  for all using (is_super_admin()) with check (is_super_admin());

create table point_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  reason_id uuid not null references point_reasons(id) on delete restrict,
  points integer not null,
  note text not null default '',
  logged_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table point_events enable row level security;

create policy "employees read own point_events" on point_events
  for select using (employee_id = auth.uid());
create policy "billing roles read all point_events" on point_events
  for select using (is_billing_role());

create policy "admin tier inserts any point_events" on point_events
  for insert with check (is_owner_or_admin());
create policy "manager inserts point_events for own reports" on point_events
  for insert with check (
    current_profile_role() = 'manager'
    and exists (select 1 from profiles e where e.id = employee_id and e.manager_id = auth.uid())
  );

create policy "admin tier updates any point_events" on point_events
  for update using (is_owner_or_admin());
create policy "logger updates own point_events" on point_events
  for update using (logged_by = auth.uid());

create policy "admin tier deletes any point_events" on point_events
  for delete using (is_owner_or_admin());
create policy "logger deletes own point_events" on point_events
  for delete using (logged_by = auth.uid());
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with `project_id: "ijhzwnkkadpalkzhassk"`, `name: "employee_performance_points"`, and the SQL above.

- [ ] **Step 3: Verify role + manager_id landed correctly**

Run via `mcp__claude_ai_Supabase__execute_sql` on the same project:
```sql
select email, role, manager_id from profiles order by created_at;
```
Expected: `arora.nikhil@studiobee.co.in` has `role = 'super_admin'`; the other two rows still have `role = 'admin'`; all `manager_id` are null.

- [ ] **Step 4: Verify the new functions and tables exist**

```sql
select proname from pg_proc where proname in ('is_owner_or_admin', 'is_billing_role', 'is_super_admin');
select tablename from pg_tables where tablename in ('point_reasons', 'point_events');
select policyname from pg_policies where tablename = 'point_events' order by policyname;
```
Expected: all 3 function names returned; both table names returned; exactly 8 policy names returned on `point_events` (2 select + 2 insert + 2 update + 2 delete).

**Addendum (found during execution):** an automated security review of this migration flagged that the "logger updates own point_events" policy had a `using` clause but no `with check`, letting a manager reassign their own logged row's `employee_id` to an employee outside their reports. Fixed in a follow-up migration `0033_point_events_update_check.sql`, applied the same way (see spec's Migration Safety section for the updated risk note).

---

### Task 2: RBAC helpers in profile.ts (with unit tests)

**Files:**
- Modify: `mystudiobee/src/lib/profile.ts`
- Create: `mystudiobee/src/lib/profile.test.ts`

**Interfaces:**
- Produces: `Role = "super_admin" | "admin" | "manager" | "employee"`; `Profile.manager_id: string | null`; `isAdminTier(role): boolean`; `isSuperAdmin(role): boolean`; `canSeeCost(role): boolean`; `isBillingRole(role): boolean`.
- Consumed by: every task from here on.

- [ ] **Step 1: Write the failing test**

Create `mystudiobee/src/lib/profile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isAdminTier, isSuperAdmin, canSeeCost, isBillingRole } from "./profile";

describe("isAdminTier", () => {
  it("is true for admin and super_admin", () => {
    expect(isAdminTier("admin")).toBe(true);
    expect(isAdminTier("super_admin")).toBe(true);
  });
  it("is false for manager and employee", () => {
    expect(isAdminTier("manager")).toBe(false);
    expect(isAdminTier("employee")).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  it("is true only for super_admin", () => {
    expect(isSuperAdmin("super_admin")).toBe(true);
    expect(isSuperAdmin("admin")).toBe(false);
    expect(isSuperAdmin("manager")).toBe(false);
    expect(isSuperAdmin("employee")).toBe(false);
  });
});

describe("canSeeCost", () => {
  it("matches isAdminTier", () => {
    expect(canSeeCost("super_admin")).toBe(true);
    expect(canSeeCost("admin")).toBe(true);
    expect(canSeeCost("manager")).toBe(false);
    expect(canSeeCost("employee")).toBe(false);
  });
});

describe("isBillingRole", () => {
  it("is true for super_admin, admin, and manager", () => {
    expect(isBillingRole("super_admin")).toBe(true);
    expect(isBillingRole("admin")).toBe(true);
    expect(isBillingRole("manager")).toBe(true);
  });
  it("is false for employee", () => {
    expect(isBillingRole("employee")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mystudiobee && npx vitest run src/lib/profile.test.ts`
Expected: FAIL — `isAdminTier`/`isSuperAdmin` are not exported from `./profile` yet.

- [ ] **Step 3: Update profile.ts**

Replace the full contents of `mystudiobee/src/lib/profile.ts`:
```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "super_admin" | "admin" | "manager" | "employee";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  manager_id: string | null;
  active: boolean;
};

/** Current signed-in user's profile. proxy.ts already guarantees a session + active
 * profile exists for any route this is called from, so this should never return null
 * in practice — but callers should still handle it defensively. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, manager_id, active")
    .eq("id", userData.user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
});

export function isAdminTier(role: Role) {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: Role) {
  return role === "super_admin";
}

export function canSeeCost(role: Role) {
  return isAdminTier(role);
}

export function isBillingRole(role: Role) {
  return isAdminTier(role) || role === "manager";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mystudiobee && npx vitest run src/lib/profile.test.ts`
Expected: PASS (4 test suites, 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add mystudiobee/src/lib/profile.ts mystudiobee/src/lib/profile.test.ts
git commit -m "feat(mystudiobee): add super_admin role and consolidated RBAC helpers"
```

---

### Task 3: Consolidate admin-tier checks in server actions + middleware

**Files:**
- Modify: `mystudiobee/src/lib/supabase/proxy.ts`
- Modify: `mystudiobee/src/lib/actions/team.ts`
- Modify: `mystudiobee/src/lib/actions/cost-model.ts`
- Modify: `mystudiobee/src/lib/actions/vendors.ts`
- Modify: `mystudiobee/src/lib/actions/hires.ts`
- Modify: `mystudiobee/src/lib/actions/equipment.ts`
- Modify: `mystudiobee/src/lib/actions/clients.ts`
- Modify: `mystudiobee/src/lib/actions/documents.ts`
- Modify: `mystudiobee/src/lib/actions/time.ts`

**Interfaces:**
- Consumes: `isAdminTier(role)` from Task 2.
- Produces: no new exports; every action file's authorization check now reads `isAdminTier(profile.role)` instead of `profile.role !== "admin"` (or, for the plain-string-arg helpers, `role !== "admin"`).

- [ ] **Step 1: `proxy.ts`** — add `isAdminTier` import, use it for the `/admin` gate, and allow `/performance` for employees

```ts
import { isAdminTier } from "@/lib/profile";
```
(add alongside the existing imports at the top)

Change:
```ts
    const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    if (isAdminOnly && profile.role !== "admin") {
```
to:
```ts
    const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    if (isAdminOnly && !isAdminTier(profile.role as Role)) {
```
(import `type { Role }` from `@/lib/profile` alongside `isAdminTier`, since `profile.role` here comes from a raw Supabase row typed as `string`)

Change:
```ts
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/tasks") ||
        pathname.startsWith("/clock") ||
        pathname.startsWith("/projects");
```
to:
```ts
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/tasks") ||
        pathname.startsWith("/clock") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/performance");
```

- [ ] **Step 2: `team.ts`** — rename `requireAdmin` to `requireAdminTier`

Change:
```ts
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Not authorized — admin only.");
  }
  return profile;
}
```
to:
```ts
async function requireAdminTier() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    throw new Error("Not authorized — admin only.");
  }
  return profile;
}
```
Add `isAdminTier` to the existing `import { getCurrentProfile, type Role } from "@/lib/profile";` line. Replace all 4 call sites (`requireAdmin()` → `requireAdminTier()`) in `inviteEmployee`, `updateEmployeeRole`, `setEmployeeActive`, `deleteEmployee`.

- [ ] **Step 3: `cost-model.ts`** — same rename

Change:
```ts
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Not authorized — admin only.");
  }
  return profile;
}
```
to:
```ts
async function requireAdminTier() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    throw new Error("Not authorized — admin only.");
  }
  return profile;
}
```
Add `isAdminTier` to the `import { getCurrentProfile } from "@/lib/profile";` line (becomes `import { getCurrentProfile, isAdminTier } from "@/lib/profile";`). Replace all 5 `requireAdmin()` call sites with `requireAdminTier()`.

- [ ] **Step 4: `vendors.ts`, `hires.ts`, `equipment.ts`** — same change in all three (identical current code in each)

Each file currently defines `requireAdmin(role: string)` (renamed from `requireOwnerOrAdmin` during the earlier owner→admin merge). Change:
```ts
function requireAdmin(role: string) {
  if (role !== "admin") throw new Error("Unauthorised");
}
```
to:
```ts
function requireAdminTier(role: Role) {
  if (!isAdminTier(role)) throw new Error("Unauthorised");
}
```
Add `import { type Role, isAdminTier } from "@/lib/profile";` (or extend the existing `getCurrentProfile` import line to include `type Role, isAdminTier`). Replace every `requireAdmin(profile.role)` call with `requireAdminTier(profile.role)` (4 call sites in `vendors.ts`, 4 in `hires.ts`, 5 in `equipment.ts`).

- [ ] **Step 5: `clients.ts`** — rename `requireAdmin` to `requireAdminTier`

Change:
```ts
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Only admin can delete or restore clients.");
  }
  return profile;
}
```
to:
```ts
async function requireAdminTier() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminTier(profile.role)) {
    throw new Error("Only admin can delete or restore clients.");
  }
  return profile;
}
```
Add `isAdminTier` to `import { getCurrentProfile, isBillingRole } from "@/lib/profile";`. Replace the 4 `requireAdmin()` call sites (`deleteClient`, `restoreClient`, `purgeClient`, `listBinnedClients`) with `requireAdminTier()`.

- [ ] **Step 6: `documents.ts`** — inline check

Change:
```ts
  if (profile.role !== "admin") {
    throw new Error("Only admin can delete documents");
  }
```
to:
```ts
  if (!isAdminTier(profile.role)) {
    throw new Error("Only admin can delete documents");
  }
```
Add `isAdminTier` to `import { getCurrentProfile, isBillingRole, canSeeCost } from "@/lib/profile";`.

- [ ] **Step 7: `time.ts`** — two inline checks

Change both occurrences of:
```ts
  if (profile.role !== "admin") {
```
to:
```ts
  if (!isAdminTier(profile.role)) {
```
(one in `deleteTimeEntry`, one in `restoreTimeEntry`; error messages `"Only admin can delete time entries"` / `"Only admin can restore time entries"` stay unchanged). Add `isAdminTier` import from `@/lib/profile` at the top of the file.

- [ ] **Step 8: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0, no errors.

- [ ] **Step 9: Verify no stale checks remain**

Run: `cd mystudiobee && grep -rn 'role !== "admin"\|role === "admin"' src/lib/actions/ src/lib/supabase/proxy.ts`
Expected: no matches (all replaced with `isAdminTier`/`!isAdminTier`).

- [ ] **Step 10: Commit**

```bash
git add mystudiobee/src/lib/supabase/proxy.ts mystudiobee/src/lib/actions/team.ts mystudiobee/src/lib/actions/cost-model.ts mystudiobee/src/lib/actions/vendors.ts mystudiobee/src/lib/actions/hires.ts mystudiobee/src/lib/actions/equipment.ts mystudiobee/src/lib/actions/clients.ts mystudiobee/src/lib/actions/documents.ts mystudiobee/src/lib/actions/time.ts
git commit -m "refactor(mystudiobee): consolidate admin-tier checks in server actions + middleware"
```

---

### Task 4: Consolidate admin-tier checks in pages + sidebar

**Files:**
- Modify: `mystudiobee/src/components/layout/app-sidebar.tsx`
- Modify: `mystudiobee/src/app/(app)/bin/page.tsx`
- Modify: `mystudiobee/src/app/(app)/clients/[id]/page.tsx`
- Modify: `mystudiobee/src/app/(app)/admin/team/page.tsx`
- Modify: `mystudiobee/src/app/(app)/admin/services/page.tsx`
- Modify: `mystudiobee/src/app/(app)/admin/cost-model/page.tsx`
- Modify: `mystudiobee/src/app/(app)/admin/equipment/page.tsx`
- Modify: `mystudiobee/src/app/(app)/admin/vendors/page.tsx`
- Modify: `mystudiobee/src/app/(app)/admin/hires/page.tsx`
- Modify: `mystudiobee/src/app/(app)/reports/page.tsx`
- Modify: `mystudiobee/src/app/(app)/reports/pnl/page.tsx`
- Modify: `mystudiobee/src/app/(app)/reports/hours/page.tsx`

**Interfaces:**
- Consumes: `isAdminTier(role)` from Task 2.

- [ ] **Step 1: `app-sidebar.tsx`** — import + variable rename, add Performance nav, remove Profit Split entry

Add `Award` to the existing `lucide-react` import list (alongside `LayoutDashboard`, `Users`, etc.).
Add `import { isAdminTier, type Role } from "@/lib/profile";` (replaces the existing bare `import type { Role } from "@/lib/profile";`).

Change the nav array (remove the Profit Split line):
```ts
const adminNav: NavEntry[] = [
  { title: "Team", href: "/admin/team", icon: UserCog },
  { title: "Services", href: "/admin/services", icon: Layers },
  { title: "Cost Model", href: "/admin/cost-model", icon: Calculator },
  { title: "Profit Split", href: "/admin/profit-split", icon: PieChart },
  { title: "Equipment", href: "/admin/equipment", icon: Package },
  { title: "Equipment Vendors", href: "/admin/vendors", icon: Truck },
  { title: "External Hires", href: "/admin/hires", icon: Contact },
];
```
to:
```ts
const adminNav: NavEntry[] = [
  { title: "Team", href: "/admin/team", icon: UserCog },
  { title: "Services", href: "/admin/services", icon: Layers },
  { title: "Cost Model", href: "/admin/cost-model", icon: Calculator },
  { title: "Equipment", href: "/admin/equipment", icon: Package },
  { title: "Equipment Vendors", href: "/admin/vendors", icon: Truck },
  { title: "External Hires", href: "/admin/hires", icon: Contact },
];
const performanceNav: NavEntry[] = [{ title: "Performance", href: "/performance", icon: Award }];
```
(`PieChart` import from lucide-react can stay even if now otherwise unused elsewhere — check with step 8's typecheck; if unused, remove it from the import list.)

Change:
```ts
  const isAdmin = role === "admin";
  const isBilling = isAdmin || role === "manager";
```
to:
```ts
  const isAdminTierRole = isAdminTier(role);
  const isBilling = isAdminTierRole || role === "manager";
```

Change:
```tsx
      <SidebarContent className="px-3 py-1.5">
        <Group items={workspaceNav} pathname={pathname} />
        {isBilling && <Group label="CRM" items={crmNav} pathname={pathname} />}
        <Group label="Projects" items={projectNav} pathname={pathname} />
        <Group label="Tasks" items={taskNav} pathname={pathname} />
        <Group label="Time" items={clockNav} pathname={pathname} />
        {isBilling && <Group label="Billing" items={billingNav} pathname={pathname} />}
        {isAdmin && <Group label="Admin" items={adminNav} pathname={pathname} />}
        {isAdmin && <Group label="Insights" items={reportNav} pathname={pathname} />}
        {isAdmin && <Group items={binNav} pathname={pathname} />}
      </SidebarContent>
```
to:
```tsx
      <SidebarContent className="px-3 py-1.5">
        <Group items={workspaceNav} pathname={pathname} />
        {isBilling && <Group label="CRM" items={crmNav} pathname={pathname} />}
        <Group label="Projects" items={projectNav} pathname={pathname} />
        <Group label="Tasks" items={taskNav} pathname={pathname} />
        <Group label="Time" items={clockNav} pathname={pathname} />
        <Group label="Performance" items={performanceNav} pathname={pathname} />
        {isBilling && <Group label="Billing" items={billingNav} pathname={pathname} />}
        {isAdminTierRole && <Group label="Admin" items={adminNav} pathname={pathname} />}
        {isAdminTierRole && <Group label="Insights" items={reportNav} pathname={pathname} />}
        {isAdminTierRole && <Group items={binNav} pathname={pathname} />}
      </SidebarContent>
```

- [ ] **Step 2: `bin/page.tsx`**

Change:
```ts
import { getCurrentProfile } from "@/lib/profile";
```
to:
```ts
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
```
Change:
```ts
  if (!profile || profile.role !== "admin") redirect("/");
```
to:
```ts
  if (!profile || !isAdminTier(profile.role)) redirect("/");
```

- [ ] **Step 3: `clients/[id]/page.tsx`**

Change:
```ts
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
```
to:
```ts
import { getCurrentProfile, isBillingRole, isAdminTier } from "@/lib/profile";
```
Change:
```ts
  const canDelete = profile.role === "admin";
```
to:
```ts
  const canDelete = isAdminTier(profile.role);
```

- [ ] **Step 4: `admin/team/page.tsx`**

Change:
```ts
import { getCurrentProfile } from "@/lib/profile";
```
to:
```ts
import { getCurrentProfile, isAdminTier } from "@/lib/profile";
```
Change:
```ts
  if (!profile || profile.role !== "admin") redirect("/");
```
to:
```ts
  if (!profile || !isAdminTier(profile.role)) redirect("/");
```
Also change the employees query (needed by Task 9) from:
```ts
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active")
    .order("email");
```
to:
```ts
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active, manager_id")
    .order("email");
```

- [ ] **Step 5: `admin/services/page.tsx`, `admin/cost-model/page.tsx`** (both use the single-line form)

In each, change:
```ts
  if (!profile || profile.role !== "admin") redirect("/");
```
to:
```ts
  if (!profile || !isAdminTier(profile.role)) redirect("/");
```
and add `isAdminTier` to each file's `import { getCurrentProfile } from "@/lib/profile";` line.

- [ ] **Step 6: `admin/equipment/page.tsx`, `admin/vendors/page.tsx`, `admin/hires/page.tsx`, `reports/page.tsx`, `reports/pnl/page.tsx`, `reports/hours/page.tsx`** (all use the block form)

In each, change:
```ts
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }
```
to:
```ts
  if (!profile || !isAdminTier(profile.role)) {
    redirect("/");
  }
```
and add `isAdminTier` to each file's `import { getCurrentProfile } from "@/lib/profile";` line.

- [ ] **Step 7: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 8: Verify no stale checks remain**

Run: `cd mystudiobee && grep -rn 'role !== "admin"\|role === "admin"' src/app src/components`
Expected: no matches.

**Addendum (found during execution):** `reports/time/page.tsx` also had a `profile.role === "admin"` check that wasn't in this task's file list — it never used the word "owner" during the earlier owner→admin merge, so it never surfaced in that history-based grep. Fixed the same way (`isAdminTier(profile.role)`), added to this task's commit.

- [ ] **Step 9: Commit**

```bash
git add mystudiobee/src/components/layout/app-sidebar.tsx "mystudiobee/src/app/(app)/bin/page.tsx" "mystudiobee/src/app/(app)/clients/[id]/page.tsx" "mystudiobee/src/app/(app)/admin/team/page.tsx" "mystudiobee/src/app/(app)/admin/services/page.tsx" "mystudiobee/src/app/(app)/admin/cost-model/page.tsx" "mystudiobee/src/app/(app)/admin/equipment/page.tsx" "mystudiobee/src/app/(app)/admin/vendors/page.tsx" "mystudiobee/src/app/(app)/admin/hires/page.tsx" "mystudiobee/src/app/(app)/reports/page.tsx" "mystudiobee/src/app/(app)/reports/pnl/page.tsx" "mystudiobee/src/app/(app)/reports/hours/page.tsx"
git commit -m "refactor(mystudiobee): consolidate admin-tier checks in pages + sidebar, add Performance nav"
```

---

### Task 5: Restrict profit-split editing to super_admin

**Files:**
- Modify: `mystudiobee/src/lib/actions/profit-split.ts`

**Interfaces:**
- Consumes: `isSuperAdmin(role)` from Task 2.

- [ ] **Step 1: Update the guard**

Change:
```ts
function requireAdmin(role: string) {
  if (role !== "admin") throw new Error("Unauthorised");
}
```
to:
```ts
function requireSuperAdmin(role: Role) {
  if (!isSuperAdmin(role)) throw new Error("Unauthorised — super_admin only.");
}
```
Add `import { type Role, isSuperAdmin } from "@/lib/profile";` to the top imports. Replace both `requireAdmin(profile.role)` call sites (in `upsertProfitSplitSettings` and `getProfitSplitSettings`) with `requireSuperAdmin(profile.role)`.

**Addendum (found during execution):** also changed both `revalidatePath("/admin/profit-split")` calls to `revalidatePath("/performance")`, since Task 13 deletes the old route — revalidating a path that won't exist is harmless but pointless, and this was cheap to fix while already in the file.

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/actions/profit-split.ts
git commit -m "feat(mystudiobee): restrict profit-split settings to super_admin"
```

---

### Task 6: manager_id assignment (updateEmployeeManager action)

**Files:**
- Modify: `mystudiobee/src/lib/actions/team.ts`

**Interfaces:**
- Produces: `updateEmployeeManager(id: string, managerId: string | null): Promise<void>`.
- Consumed by: Task 9 (Team page UI).

- [ ] **Step 1: Add the action**

Add to `mystudiobee/src/lib/actions/team.ts`, directly after `updateEmployeeRole`:
```ts
export async function updateEmployeeManager(id: string, managerId: string | null) {
  await requireAdminTier();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ manager_id: managerId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/actions/team.ts
git commit -m "feat(mystudiobee): add updateEmployeeManager action"
```

---

### Task 7: performance/types.ts

**Files:**
- Create: `mystudiobee/src/lib/performance/types.ts`

**Interfaces:**
- Produces: `PointReason`, `PointEvent`, `EmployeeScore` types.
- Consumed by: Tasks 8, 9 (team-client manager dropdown reuses `EmployeeScore`-adjacent shape? No — Task 9 uses the existing `Employee` type from `team-client.tsx`, extended inline), 10, 11, 12, 13.

- [ ] **Step 1: Write the file**

```ts
export type PointReason = {
  id: string;
  label: string;
  points: number;
  active: boolean;
};

export type PointEvent = {
  id: string;
  employee_id: string;
  reason_id: string;
  points: number;
  note: string;
  logged_by: string | null;
  created_at: string;
  reason_label: string;
};

export type EmployeeScore = {
  id: string;
  display_name: string;
  email: string;
  manager_id: string | null;
  score: number;
};
```

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0 (new file has no consumers yet, so this just confirms no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/performance/types.ts
git commit -m "feat(mystudiobee): add performance point types"
```

---

### Task 8: performance.ts server actions

**Files:**
- Create: `mystudiobee/src/lib/actions/performance.ts`

**Interfaces:**
- Consumes: `PointReason`, `PointEvent`, `EmployeeScore` from Task 7; `getCurrentProfile`, `isAdminTier`, `isSuperAdmin` from Task 2.
- Produces:
  - `getPointReasons(): Promise<PointReason[]>`
  - `upsertPointReason(input: { id?: string; label: string; points: number }): Promise<void>`
  - `setPointReasonActive(id: string, active: boolean): Promise<void>`
  - `getEmployeeScores(): Promise<EmployeeScore[]>`
  - `getPointEvents(employeeId?: string): Promise<PointEvent[]>`
  - `logPointEvent(input: { employeeId: string; reasonId: string; note?: string }): Promise<void>`
  - `updatePointEvent(id: string, note: string): Promise<void>`
  - `deletePointEvent(id: string): Promise<void>`
- Consumed by: Tasks 11, 12, 13 (page + tabs).

- [ ] **Step 1: Write the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminTier, isSuperAdmin } from "@/lib/profile";
import type { PointReason, PointEvent, EmployeeScore } from "@/lib/performance/types";

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || !isSuperAdmin(profile.role)) {
    throw new Error("Not authorized — super_admin only.");
  }
  return profile;
}

// ── Point reasons (super_admin only) ────────────────────────────────────

export async function getPointReasons(): Promise<PointReason[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data, error } = await supabase.from("point_reasons").select("*").order("label");
  if (error) throw new Error(error.message);
  return (data ?? []) as PointReason[];
}

export async function upsertPointReason(input: { id?: string; label: string; points: number }) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const payload = { label: input.label, points: input.points };
  const { error } = input.id
    ? await supabase.from("point_reasons").update(payload).eq("id", input.id)
    : await supabase.from("point_reasons").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function setPointReasonActive(id: string, active: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("point_reasons").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

// ── Point events ─────────────────────────────────────────────────────────

export async function getEmployeeScores(): Promise<EmployeeScore[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  const [{ data: employees, error: empError }, { data: events, error: evError }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, email, manager_id").eq("role", "employee").eq("active", true),
    supabase.from("point_events").select("employee_id, points"),
  ]);
  if (empError) throw new Error(empError.message);
  if (evError) throw new Error(evError.message);

  const scoreByEmployee = new Map<string, number>();
  for (const e of events ?? []) {
    scoreByEmployee.set(e.employee_id, (scoreByEmployee.get(e.employee_id) ?? 0) + e.points);
  }

  return (employees ?? []).map((e) => ({
    id: e.id,
    display_name: e.display_name,
    email: e.email,
    manager_id: e.manager_id,
    score: scoreByEmployee.get(e.id) ?? 0,
  }));
}

export async function getPointEvents(employeeId?: string): Promise<PointEvent[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  let query = supabase
    .from("point_events")
    .select("id, employee_id, reason_id, points, note, logged_by, created_at, point_reasons(label)")
    .order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const reason = row.point_reasons as unknown as { label: string } | null;
    return {
      id: row.id,
      employee_id: row.employee_id,
      reason_id: row.reason_id,
      points: row.points,
      note: row.note,
      logged_by: row.logged_by,
      created_at: row.created_at,
      reason_label: reason?.label ?? "—",
    };
  });
}

export async function logPointEvent(input: { employeeId: string; reasonId: string; note?: string }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  if (profile.role === "manager") {
    const { data: employee } = await supabase.from("profiles").select("manager_id").eq("id", input.employeeId).maybeSingle();
    if (employee?.manager_id !== profile.id) throw new Error("You can only log points for your own reports.");
  } else if (!isAdminTier(profile.role)) {
    throw new Error("Unauthorised");
  }

  const { data: reason, error: reasonError } = await supabase.from("point_reasons").select("points").eq("id", input.reasonId).single();
  if (reasonError) throw new Error(reasonError.message);

  const { error } = await supabase.from("point_events").insert({
    employee_id: input.employeeId,
    reason_id: input.reasonId,
    points: reason.points,
    note: input.note ?? "",
    logged_by: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function updatePointEvent(id: string, note: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  if (!isAdminTier(profile.role)) {
    const { data: existing } = await supabase.from("point_events").select("logged_by").eq("id", id).maybeSingle();
    if (existing?.logged_by !== profile.id) throw new Error("You can only edit events you logged.");
  }

  const { error } = await supabase.from("point_events").update({ note }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function deletePointEvent(id: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();

  if (!isAdminTier(profile.role)) {
    const { data: existing } = await supabase.from("point_events").select("logged_by").eq("id", id).maybeSingle();
    if (existing?.logged_by !== profile.id) throw new Error("You can only delete events you logged.");
  }

  const { error } = await supabase.from("point_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual verification against the live database**

Using `mcp__claude_ai_Supabase__execute_sql` on project `ijhzwnkkadpalkzhassk`, seed one test reason and confirm RLS behaves as designed (these queries run as the service role, so they verify data shape, not RLS itself — RLS is verified by logging into the running app as different roles in Task 14):
```sql
insert into point_reasons (label, points) values ('Late arrival', -2), ('Great client feedback', 5);
select * from point_reasons order by label;
```
Expected: 2 rows returned with the labels/points above.

- [ ] **Step 4: Commit**

```bash
git add mystudiobee/src/lib/actions/performance.ts
git commit -m "feat(mystudiobee): add performance point server actions"
```

---

### Task 9: Team page — super_admin role option + Reports To field

**Files:**
- Modify: `mystudiobee/src/app/(app)/admin/team/team-client.tsx`

**Interfaces:**
- Consumes: `updateEmployeeManager` from Task 6; `employees` prop now includes `manager_id` (from Task 4, Step 4).

- [ ] **Step 1: Update the `Employee` type, `ROLES`, and `ROLE_PERMISSIONS`**

Change:
```ts
type Employee = { id: string; email: string; display_name: string; role: Role; active: boolean };

const ROLES: Role[] = ["admin", "manager", "employee"];

const ROLE_PERMISSIONS: Record<Role, string> = {
  admin: "Full access — billing, cost visibility, admin settings, team management.",
  manager: "Clients, projects, quotes/invoices/receipts — no cost breakdowns or admin settings.",
  employee: "Tasks and Clock In only. No billing or client access.",
};
```
to:
```ts
type Employee = { id: string; email: string; display_name: string; role: Role; active: boolean; manager_id: string | null };

const ROLES: Role[] = ["super_admin", "admin", "manager", "employee"];

const ROLE_PERMISSIONS: Record<Role, string> = {
  super_admin: "Everything admin has, plus profit-split percentages and point-reason management.",
  admin: "Full access — billing, cost visibility, admin settings, team management.",
  manager: "Clients, projects, quotes/invoices/receipts — no cost breakdowns or admin settings.",
  employee: "Tasks and Clock In only. No billing or client access.",
};
```

- [ ] **Step 2: Add the import**

Add `updateEmployeeManager` to the existing action import:
```ts
import { inviteEmployee, updateEmployeeRole, updateEmployeeManager, setEmployeeActive, deleteEmployee } from "@/lib/actions/team";
```

- [ ] **Step 3: Add a "Reports To" table column**

Change the table header:
```tsx
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
```
to:
```tsx
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Reports To</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
```

Add a new `<TableCell>` directly after the existing Role `<TableCell>` (the one containing the role `<Select>`), before the Active `<TableCell>`:
```tsx
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
```

- [ ] **Step 4: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0 — this is the first fully clean typecheck since Task 1 (all downstream breaks from Tasks 2-8 were this file).

**Addendum (found during execution):** the existing `className="capitalize"` on the role `<SelectItem>`s only capitalizes the first letter per CSS word-boundary rules — it doesn't touch underscores, so `super_admin` would render as "Super_admin". Changed both `{r}` renders to `{r.replace("_", " ")}` so CSS capitalize produces "Super Admin". The sidebar footer (`app-sidebar.tsx:175`, from Task 4) has the identical `capitalize` class on the raw `{role}` string — same fix applied there (`{role.replace("_", " ")}`), added to this commit since it's the same class of issue discovered here.

- [ ] **Step 5: Commit**

```bash
git add "mystudiobee/src/app/(app)/admin/team/team-client.tsx" mystudiobee/src/components/layout/app-sidebar.tsx
git commit -m "feat(mystudiobee): add super_admin role option and Reports To field on Team page"
```

---

### Task 10: /performance page shell + employee's own history view

**Files:**
- Create: `mystudiobee/src/app/(app)/performance/page.tsx`
- Create: `mystudiobee/src/app/(app)/performance/performance-client.tsx`
- Create: `mystudiobee/src/app/(app)/performance/my-history.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 2), `getPointEvents`/`getEmployeeScores`/`getPointReasons` (Task 8), `getProfitSplitSettings` from `@/lib/actions/profit-split` (pre-existing, guard updated in Task 5 but signature unchanged), `isAdminTier`/`isSuperAdmin` (Task 2).
- Produces: `PerformanceClient` props `{ role: Role; profileId: string; myEvents: PointEvent[]; scores: EmployeeScore[]; reasons: PointReason[]; profitSplitSettings: ProfitSplitSettings[] }` (the last two only populated for admin-tier/super_admin — empty arrays otherwise). Consumed by Tasks 11 (team-scores), 12 (point-reasons-tab), 13 (profit-split-tab), which this task wires together with placeholder imports that Tasks 11–13 will fill in.

- [ ] **Step 1: `my-history.tsx`**

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PointEvent } from "@/lib/performance/types";

export function MyHistory({ events }: { events: PointEvent[] }) {
  const score = events.reduce((sum, e) => sum + e.points, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-card inline-flex flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your score</p>
        <p className="font-heading text-2xl font-bold">{score}</p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{e.reason_label}</TableCell>
                <TableCell className={e.points < 0 ? "text-destructive" : "text-emerald-600"}>
                  {e.points > 0 ? `+${e.points}` : e.points}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.note || "—"}</TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  No point events yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `performance-client.tsx`**

```tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Role } from "@/lib/profile";
import type { PointEvent, EmployeeScore, PointReason } from "@/lib/performance/types";
import type { ProfitSplitSettings } from "@/lib/profit-split/engine";
import { MyHistory } from "./my-history";
import { TeamScores } from "./team-scores";
import { PointReasonsTab } from "./point-reasons-tab";
import { ProfitSplitTab } from "./profit-split-tab";

export function PerformanceClient({
  role,
  profileId,
  myEvents,
  scores,
  reasons,
  profitSplitSettings,
}: {
  role: Role;
  profileId: string;
  myEvents: PointEvent[];
  scores: EmployeeScore[];
  reasons: PointReason[];
  profitSplitSettings: ProfitSplitSettings[];
}) {
  if (role === "employee") {
    return <MyHistory events={myEvents} />;
  }

  if (role !== "super_admin") {
    return <TeamScores scores={scores} reasons={reasons} role={role} profileId={profileId} />;
  }

  return (
    <Tabs defaultValue="scores">
      <TabsList>
        <TabsTrigger value="scores">Team Scores</TabsTrigger>
        <TabsTrigger value="reasons">Point Reasons</TabsTrigger>
        <TabsTrigger value="profit-split">Profit Split</TabsTrigger>
      </TabsList>
      <TabsContent value="scores" className="mt-4">
        <TeamScores scores={scores} reasons={reasons} role={role} profileId={profileId} />
      </TabsContent>
      <TabsContent value="reasons" className="mt-4">
        <PointReasonsTab reasons={reasons} />
      </TabsContent>
      <TabsContent value="profit-split" className="mt-4">
        <ProfitSplitTab settings={profitSplitSettings} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getPointEvents, getEmployeeScores, getPointReasons } from "@/lib/actions/performance";
import { getProfitSplitSettings } from "@/lib/actions/profit-split";
import { PerformanceClient } from "./performance-client";

export default async function PerformancePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const myEvents = profile.role === "employee" ? await getPointEvents() : [];
  const scores = profile.role !== "employee" ? await getEmployeeScores() : [];
  const reasons = profile.role !== "employee" ? await getPointReasons() : [];
  const profitSplitSettings = profile.role === "super_admin" ? await getProfitSplitSettings() : [];

  return (
    <>
      <DashboardHeader title="Performance" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PerformanceClient
          role={profile.role}
          profileId={profile.id}
          myEvents={myEvents}
          scores={scores}
          reasons={reasons}
          profitSplitSettings={profitSplitSettings}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: FAILS at this point — `team-scores.tsx`, `point-reasons-tab.tsx`, `profit-split-tab.tsx` don't exist yet (Tasks 11–13). This is expected; do not commit yet. Proceed to Task 11 before committing anything in this task.

---

### Task 11: Team scores table + log-event dialog

**Files:**
- Create: `mystudiobee/src/app/(app)/performance/team-scores.tsx`

**Interfaces:**
- Consumes: `EmployeeScore`, `PointReason` (Task 7); `logPointEvent`, `getPointEvents`, `updatePointEvent`, `deletePointEvent` (Task 8); `Role` (Task 2).
- Produces: `TeamScores({ scores, reasons, role, profileId }): JSX.Element`, consumed by `performance-client.tsx` (Task 10, already wired).

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logPointEvent, getPointEvents, updatePointEvent, deletePointEvent } from "@/lib/actions/performance";
import type { EmployeeScore, PointReason, PointEvent } from "@/lib/performance/types";
import type { Role } from "@/lib/profile";

export function TeamScores({
  scores,
  reasons,
  role,
  profileId,
}: {
  scores: EmployeeScore[];
  reasons: PointReason[];
  role: Role;
  profileId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<EmployeeScore | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<EmployeeScore | null>(null);
  const [history, setHistory] = useState<PointEvent[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PointEvent | null>(null);
  const [editNote, setEditNote] = useState("");

  const activeReasons = reasons.filter((r) => r.active);

  function canLogFor(emp: EmployeeScore) {
    return role === "admin" || role === "super_admin" || (role === "manager" && emp.manager_id === profileId);
  }

  function canModify(e: PointEvent) {
    return role === "admin" || role === "super_admin" || e.logged_by === profileId;
  }

  async function refreshHistory() {
    if (!historyTarget) return;
    const events = await getPointEvents(historyTarget.id);
    setHistory(events);
  }

  function openEditNote(e: PointEvent) {
    setEditTarget(e);
    setEditNote(e.note);
    setEditOpen(true);
  }

  async function handleEditNote() {
    if (!editTarget) return;
    try {
      await updatePointEvent(editTarget.id, editNote);
      toast.success("Note updated");
      setEditOpen(false);
      await refreshHistory();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDeleteEvent(e: PointEvent) {
    if (!window.confirm("Delete this point event? This cannot be undone.")) return;
    try {
      await deletePointEvent(e.id);
      toast.success("Event deleted");
      await refreshHistory();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function openLog(emp: EmployeeScore) {
    setLogTarget(emp);
    setReasonId(activeReasons[0]?.id ?? "");
    setNote("");
    setLogOpen(true);
  }

  async function handleLog() {
    if (!logTarget) return;
    startTransition(async () => {
      try {
        await logPointEvent({ employeeId: logTarget.id, reasonId, note: note || undefined });
        toast.success("Point event logged");
        setLogOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to log event");
      }
    });
  }

  async function openHistory(emp: EmployeeScore) {
    setHistoryTarget(emp);
    setHistoryOpen(true);
    const events = await getPointEvents(emp.id);
    setHistory(events);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Score</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell className="font-medium">{emp.display_name || "—"}</TableCell>
              <TableCell className="text-muted-foreground">{emp.email}</TableCell>
              <TableCell className={emp.score < 0 ? "text-destructive" : ""}>{emp.score}</TableCell>
              <TableCell className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => openHistory(emp)}>
                  History
                </Button>
                {canLogFor(emp) && (
                  <Button size="sm" onClick={() => openLog(emp)}>
                    Log event
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {scores.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                No employees yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log point event — {logTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeReasons.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label} ({r.points > 0 ? `+${r.points}` : r.points})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleLog} disabled={!reasonId || pending}>
              {pending ? "Saving…" : "Log event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>History — {historyTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{e.reason_label}</TableCell>
                  <TableCell className={e.points < 0 ? "text-destructive" : "text-emerald-600"}>
                    {e.points > 0 ? `+${e.points}` : e.points}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.note || "—"}</TableCell>
                  <TableCell className="flex gap-2 justify-end">
                    {canModify(e) && (
                      <>
                        <button onClick={() => openEditNote(e)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteEvent(e)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No point events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleEditNote}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: still FAILS — `point-reasons-tab.tsx` and `profit-split-tab.tsx` don't exist yet. Expected; proceed to Task 12.

---

### Task 12: Point reasons management tab (super_admin only)

**Files:**
- Create: `mystudiobee/src/app/(app)/performance/point-reasons-tab.tsx`

**Interfaces:**
- Consumes: `PointReason` (Task 7); `upsertPointReason`, `setPointReasonActive` (Task 8).
- Produces: `PointReasonsTab({ reasons }): JSX.Element`, consumed by `performance-client.tsx` (Task 10, already wired).

- [ ] **Step 1: Write the file** (modeled on `cost-model-client.tsx`'s `RolesTab` dialog pattern)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
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
import { upsertPointReason, setPointReasonActive } from "@/lib/actions/performance";
import type { PointReason } from "@/lib/performance/types";

export function PointReasonsTab({ reasons }: { reasons: PointReason[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PointReason | null>(null);
  const [label, setLabel] = useState("");
  const [points, setPoints] = useState("");

  function openNew() {
    setEditing(null);
    setLabel("");
    setPoints("");
    setOpen(true);
  }
  function openEdit(reason: PointReason) {
    setEditing(reason);
    setLabel(reason.label);
    setPoints(String(reason.points));
    setOpen(true);
  }

  async function handleSave() {
    try {
      await upsertPointReason({ id: editing?.id, label, points: Number(points) });
      toast.success(editing ? "Reason updated" : "Reason added");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">Point Reasons</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Add reason
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit reason" : "Add reason"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Late arrival" />
              </div>
              <div className="space-y-1.5">
                <Label>Points (negative for penalties)</Label>
                <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="-2" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!label || !points}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Points</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {reasons.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.label}</TableCell>
              <TableCell className={r.points < 0 ? "text-destructive" : "text-emerald-600"}>
                {r.points > 0 ? `+${r.points}` : r.points}
              </TableCell>
              <TableCell>
                <Switch
                  checked={r.active}
                  onCheckedChange={async (v) => {
                    try {
                      await setPointReasonActive(r.id, v);
                      router.refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to update");
                    }
                  }}
                />
              </TableCell>
              <TableCell>
                <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TableCell>
            </TableRow>
          ))}
          {reasons.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                No point reasons yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: still FAILS — `profit-split-tab.tsx` doesn't exist yet. Expected; proceed to Task 13.

---

### Task 13: Relocate Profit Split editor into the Performance page

**Files:**
- Create: `mystudiobee/src/app/(app)/performance/profit-split-tab.tsx` (adapted from the file being deleted below)
- Delete: `mystudiobee/src/app/(app)/admin/profit-split/page.tsx`
- Delete: `mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx`

**Interfaces:**
- Consumes: `ProfitSplitSettings`, `ProfitSplitTier` (`@/lib/profit-split/engine`), `upsertProfitSplitSettings` (Task 5, unchanged signature).
- Produces: `ProfitSplitTab({ settings }): JSX.Element`, consumed by `performance-client.tsx` (Task 10, already wired).

- [ ] **Step 1: Create `profit-split-tab.tsx`** — identical to the current `profit-split-client.tsx` (read at `mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx`) with the component renamed and the standalone `<DashboardHeader>` removed (this is now a tab inside a page that already has its own header):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { upsertProfitSplitSettings } from "@/lib/actions/profit-split";
import type { ProfitSplitSettings, ProfitSplitTier } from "@/lib/profit-split/engine";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/categories";

const DEFAULT_TIER: ProfitSplitTier = {
  max: null,
  mode: "simple",
  company_pct: 57,
  executor_pct: 31,
  manager_pct: 12,
};

export function ProfitSplitTab({ settings }: { settings: ProfitSplitSettings[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Record<string, ProfitSplitSettings>>(() =>
    Object.fromEntries(
      settings.map((s) => [s.category, { ...s, tiers: [...s.tiers] }])
    )
  );

  function updateField(cat: string, field: "floor" | "threshold", val: string) {
    setData((d) => ({ ...d, [cat]: { ...d[cat], [field]: parseFloat(val) || 0 } }));
  }

  function updateTier(cat: string, idx: number, field: string, val: string) {
    setData((d) => {
      const tiers = [...d[cat].tiers];
      tiers[idx] = {
        ...tiers[idx],
        [field]: field === "mode" ? val : val === "" ? null : parseFloat(val) || 0,
      };
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
  }

  function addTier(cat: string) {
    setData((d) => {
      const tiers = [...d[cat].tiers];
      const lastIsInfinity = tiers[tiers.length - 1]?.max === null;
      const newTier: ProfitSplitTier = { ...DEFAULT_TIER, max: 100000 };
      if (lastIsInfinity) {
        tiers.splice(tiers.length - 1, 0, newTier);
      } else {
        tiers.push({ ...DEFAULT_TIER, max: null });
      }
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
  }

  function removeTier(cat: string, idx: number) {
    setData((d) => ({
      ...d,
      [cat]: { ...d[cat], tiers: d[cat].tiers.filter((_, i) => i !== idx) },
    }));
  }

  function save(cat: string) {
    startTransition(async () => {
      try {
        await upsertProfitSplitSettings(data[cat]);
        toast.success("Saved");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Tabs defaultValue="video">
      <TabsList>
        {CATEGORIES.map((c) => (
          <TabsTrigger key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </TabsTrigger>
        ))}
      </TabsList>

      {CATEGORIES.map((cat) => {
        const s = data[cat];
        if (!s) return null;
        const isWeb = cat === "web";

        return (
          <TabsContent key={cat} value={cat} className="space-y-6 pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Floor (₹)</p>
                <Input
                  type="number"
                  value={s.floor}
                  onChange={(e) => updateField(cat, "floor", e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Cost-Plus Threshold (₹)
                </p>
                <Input
                  type="number"
                  value={s.threshold}
                  onChange={(e) => updateField(cat, "threshold", e.target.value)}
                  className="w-36"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Max Price (₹, blank = ∞)</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Company %</TableHead>
                    <TableHead>Executor %</TableHead>
                    {isWeb ? (
                      <>
                        <TableHead>Origination %</TableHead>
                        <TableHead>Client Handling %</TableHead>
                      </>
                    ) : (
                      <TableHead>Manager %</TableHead>
                    )}
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.tiers.map((tier, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          type="number"
                          value={tier.max ?? ""}
                          placeholder="∞"
                          onChange={(e) => updateTier(cat, idx, "max", e.target.value)}
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={tier.mode}
                          onValueChange={(v) => updateTier(cat, idx, "mode", v)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="simple">Simple</SelectItem>
                            <SelectItem value="cost-plus">Cost-Plus</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={tier.company_pct}
                          onChange={(e) => updateTier(cat, idx, "company_pct", e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={tier.executor_pct}
                          onChange={(e) => updateTier(cat, idx, "executor_pct", e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      {isWeb ? (
                        <>
                          <TableCell>
                            <Input
                              type="number"
                              value={tier.origination_pct ?? 0}
                              onChange={(e) => updateTier(cat, idx, "origination_pct", e.target.value)}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={tier.client_handling_pct ?? 0}
                              onChange={(e) => updateTier(cat, idx, "client_handling_pct", e.target.value)}
                              className="w-20"
                            />
                          </TableCell>
                        </>
                      ) : (
                        <TableCell>
                          <Input
                            type="number"
                            value={tier.manager_pct ?? 0}
                            onChange={(e) => updateTier(cat, idx, "manager_pct", e.target.value)}
                            className="w-20"
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTier(cat, idx)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => addTier(cat)}>
                + Add Tier
              </Button>
              <Button size="sm" onClick={() => save(cat)} disabled={pending}>
                Save
              </Button>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
```

- [ ] **Step 2: Delete the old route**

```bash
git rm "mystudiobee/src/app/(app)/admin/profit-split/page.tsx" "mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx"
```

- [ ] **Step 3: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: exit code 0 — this is the first clean typecheck since Task 10 started (Tasks 10–13 are one interlocking unit; commit them together now).

- [ ] **Step 4: Run the full test suite**

Run: `cd mystudiobee && npx vitest run`
Expected: all existing tests + the new `profile.test.ts` from Task 2 pass.

- [ ] **Step 5: Commit Tasks 10–13 together**

```bash
git add mystudiobee/src/app/\(app\)/performance mystudiobee/src/app/\(app\)/admin/profit-split
git commit -m "feat(mystudiobee): add /performance page, relocate profit-split editor from /admin/profit-split"
```

---

### Task 13.5: Fix client-bundle break from importing isAdminTier into a client component (found during execution)

`npx tsc --noEmit` stayed clean through every prior task because it only checks types, but `npm run build` failed: `app-sidebar.tsx` is a `"use client"` component, and importing the *value* `isAdminTier` from `@/lib/profile` drags the whole module — including `getCurrentProfile`'s `createClient` from `@/lib/supabase/server`, which imports `next/headers` — into the browser bundle. Next.js correctly rejects that (`next/headers` cannot run client-side). `type`-only imports elsewhere (team-client.tsx, performance-client.tsx, team-scores.tsx) were unaffected since TypeScript type imports are erased at compile time and never reach the bundler.

Root cause confirmed via `grep`: only `app-sidebar.tsx` (client) and `proxy.ts` (middleware, same class of bundling boundary) imported `isAdminTier` as a value from `@/lib/profile`.

**Files:**
- Create: `mystudiobee/src/lib/role.ts` — the pure `Role` type + `isAdminTier`/`isSuperAdmin`/`canSeeCost`/`isBillingRole`, zero imports.
- Modify: `mystudiobee/src/lib/profile.ts` — re-exports `@/lib/role` (`export * from "@/lib/role";`), keeps `Profile` type and `getCurrentProfile` (the only things that actually need `next/headers`). Every existing server-side consumer that does `import { getCurrentProfile, isAdminTier } from "@/lib/profile"` continues to work unchanged via the re-export — no need to touch the ~20 files from Tasks 3-4.
- Modify: `mystudiobee/src/components/layout/app-sidebar.tsx` — import `isAdminTier`/`Role` from `@/lib/role` instead of `@/lib/profile`.
- Modify: `mystudiobee/src/lib/supabase/proxy.ts` — same import change.

- [ ] **Step 1: Typecheck, test, and build all pass**

```
npx tsc --noEmit        # exit 0
npx vitest run          # 27 passed (profile.test.ts still passes via the re-export)
npm run build           # ✓ Compiled successfully, /performance listed, /admin/profit-split gone
```

- [ ] **Step 2: Commit**

```bash
git add mystudiobee/src/lib/role.ts mystudiobee/src/lib/profile.ts mystudiobee/src/components/layout/app-sidebar.tsx mystudiobee/src/lib/supabase/proxy.ts
git commit -m "fix(mystudiobee): split pure role helpers out of profile.ts to unbreak client bundle"
```

---

### Task 14: Full build + manual role-based smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `cd mystudiobee && npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **Step 2: Start the dev server**

Run: `cd mystudiobee && npm run dev` (background)

- [ ] **Step 3: RLS-level role verification (executed instead of literal browser logins)**

**Deviation from plan:** the 3 real accounts belong to actual people and their passwords aren't available (and shouldn't be reset without consent just to drive a browser session). Instead, verified the exact same access-control surface directly against Postgres: wrapped role reassignments + test inserts/selects in a transaction, exercised each policy as each role via `set_config('request.jwt.claims', ...)`, then `rollback` so nothing persisted. This exercises the actual enforcement layer (RLS) more rigorously than clicking through a UI would, since the UI can only be as strict as the underlying policies anyway.

Results (all as expected):
1. Manager inserting a point_events row for their own report → succeeded.
2. Manager inserting a point_events row for a non-report → rejected (`insufficient_privilege`).
3. Employee attempting to self-insert a point_events row → rejected.
4. Employee reading point_events → sees only their own row (1 visible), zero visibility into others'.
5. Employee attempting to write point_reasons → rejected.
6. Employee reading profit_split_settings → 0 rows visible.
7. Super_admin reading profit_split_settings → 4 rows visible (the video/web/design/retainer categories).

(Test methodology note: the first pass mis-tested 6/7 using `perform ... exception when insufficient_privilege` — RLS silently filters rows on SELECT rather than raising an exception, so that pattern can't detect row-hiding. Corrected to a `select count(*)` comparison, which caught the real answer.)

Post-test verification confirmed the rollback left zero trace: all 3 profiles' `role`/`manager_id` unchanged, `point_events` count back to 0, `point_reasons` back to exactly the 2 seeded rows.

- [ ] **Step 4: App-layer UI verification (handed to the user)**

The browser-driven parts of this task — confirming the sidebar shows the right nav groups per role, the three super_admin tabs render, the Team page's role/Reports-To dropdowns work, etc. — require signing in as each real account, which only the user can do. Recommend the user do a quick pass through `/performance`, `/admin/team`, and the sidebar as their own super_admin account, since the RLS layer (the actual security boundary) is now verified independently.

---

### Task 15: Fix privilege escalation to/against super_admin (found via post-push security review)

A background security review of the pushed commits flagged that `team.ts`'s `requireAdminTier()` guard doesn't distinguish *caller* tier from *target* tier: any plain `admin` could call `updateEmployeeRole(colleagueId, 'super_admin')` to grant the tier to anyone (or themselves via a colleague), demote/deactivate/delete an *existing* super_admin, or invite a brand-new user directly as super_admin via `inviteEmployee`. This defeats the entire premise of the tier ("this adjusting feature will be limited to a new role" — not if any admin can hand it out).

**Files:**
- Modify: `mystudiobee/src/lib/actions/team.ts` — new `requireSuperAdminIfTargetIsOrBecomesSuperAdmin()` helper, called from `updateEmployeeRole`, `setEmployeeActive`, `deleteEmployee`; `inviteEmployee` gets an inline check blocking a non-super-admin from inviting a new `super_admin`.
- Modify: `mystudiobee/src/app/(app)/admin/team/team-client.tsx` — hides `super_admin` from the invite dialog's role options and a target row's role dropdown when the viewer isn't super_admin; disables the role/active toggle and hides the delete button for a row that's already `super_admin` when the viewer isn't one.
- Modify: `mystudiobee/src/app/(app)/admin/team/page.tsx` — passes `profile.role` to `TeamClient` as the new `viewerRole` prop.
- Create: `mystudiobee/supabase/migrations/0034_protect_super_admin_profiles.sql` — the app-layer guard alone isn't enough, since `updateEmployeeRole`/`setEmployeeActive` use the RLS-respecting client (not the service-role one) — narrows `profiles`' UPDATE/INSERT policies so RLS itself blocks a non-super-admin from writing a row that is (or would become) `super_admin`, closing the gap for direct API access too.

- [ ] **Step 1: Apply migration 0034, verify with the same rolled-back-transaction technique used in Task 14**

**Important tooling finding:** this technique is *not reliably safe* on this connection-pooled database. During verification, a `begin ... rollback` block from an earlier test left 2 profiles' `role`/`manager_id` corrupted (both flipped to `employee` reporting to the super_admin) and 2 stray `point_events` rows persisted, despite every individual test session showing correct rolled-back state immediately afterward. Root cause not fully diagnosed (suspected: Supabase's connection pooler not guaranteeing one physical connection for a whole multi-statement string, so `BEGIN`/`ROLLBACK` don't reliably bracket the same session as the writes). **Do not reuse this transaction-simulation technique for future RLS verification on this project** — prefer static policy-text review (`select * from pg_policies`) plus real logged-in clicks, or a disposable seed/staging project if dynamic policy testing is needed again.

Both corrupted profiles and the 2 stray `point_events` were caught (via a fresh, non-transactional state check) and manually restored/deleted immediately: `laishram.rajib`/`pal.aakash` back to `role='admin', manager_id=null`; `point_events` back to 0 rows. Final row counts confirmed clean: 3 profiles, 0 point_events, 2 point_reasons (legitimate seed data), 4 profit_split_settings.

- [ ] **Step 2: Typecheck, test, build**

```
npx tsc --noEmit     # exit 0
npx vitest run        # 27 passed
npm run build         # ✓ Compiled successfully
```

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/actions/team.ts "mystudiobee/src/app/(app)/admin/team/team-client.tsx" "mystudiobee/src/app/(app)/admin/team/page.tsx" mystudiobee/supabase/migrations/0034_protect_super_admin_profiles.sql
git commit -m "fix(mystudiobee): prevent admin-tier privilege escalation to/against super_admin"
```

---

### Task 16: Expand super_admin's scoreable roster to admin + manager (user-requested scope change)

User clarified after Task 15 landed: "the super admin should be able to give points to everyone since everyone comes under super admin basically." The v1 scope (spec + Task 14) deliberately limited the roster to `role = 'employee'` — this widens it for `super_admin` specifically while leaving `admin`/`manager` viewers unchanged (they still only ever see the employee roster; peers scoring peers doesn't make sense).

**Files:**
- Modify: `mystudiobee/src/lib/performance/types.ts` — `EmployeeScore` gains a `role: Role` field.
- Modify: `mystudiobee/src/lib/actions/performance.ts`:
  - `getEmployeeScores()`: roster query becomes role-dependent — `["admin","manager","employee"]` for a `super_admin` caller, `["employee"]` otherwise.
  - `logPointEvent()`: now fetches the target's `role` alongside `manager_id`; a non-super-admin admin-tier caller is rejected if the target's role isn't `employee`.
  - `updatePointEvent()`/`deletePointEvent()`: admin-tier callers now also fetch the target row's `profiles!employee_id(role)` and are rejected (unless super_admin) if that role isn't `employee`.
- Create: `mystudiobee/supabase/migrations/0035_super_admin_scores_everyone.sql` — narrows the 3 "admin tier ... any point_events" RLS policies (insert/update/delete) so a non-super-admin admin-tier caller is confined to `employee` targets, matching the app-layer guards.
- Modify: `mystudiobee/src/app/(app)/performance/team-scores.tsx` — adds a Role column to the scores table (roster is no longer employee-only for super_admin, so the role needs to be visible); "No employees yet" → "No team members yet".

- [ ] **Step 1: Apply migration 0035**

Verify via static policy inspection only (per the Task 15 tooling finding — no more transaction-simulation testing on this database):
```sql
select policyname, cmd, qual, with_check from pg_policies where tablename = 'point_events' and policyname like 'admin tier%' order by policyname;
```
Expected: all 3 policies' `qual`/`with_check` contain `is_super_admin() OR exists(... e.role = 'employee')`.

- [ ] **Step 2: Typecheck, test, build**

```
npx tsc --noEmit     # exit 0
npx vitest run        # 27 passed
npm run build         # ✓ Compiled successfully
```

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/performance/types.ts mystudiobee/src/lib/actions/performance.ts "mystudiobee/src/app/(app)/performance/team-scores.tsx" mystudiobee/supabase/migrations/0035_super_admin_scores_everyone.sql
git commit -m "feat(mystudiobee): let super_admin score admins and managers, not just employees"
```
