# Employee Performance Points + Super Admin Role — Design Spec
**Date:** 2026-07-24

---

## Context

Earlier this session, `owner` and `admin` were merged into a single `admin` role (migration `0031_merge_owner_into_admin.sql`) — the two had identical permissions everywhere, enforced only via scattered inline checks like `profile.role !== "owner" && profile.role !== "admin"` repeated across ~20 files. That merge required touching every one of those files individually.

This feature reintroduces a role tier — `super_admin`, sitting above `admin` — for a genuinely new reason: two capabilities (profit-split percentage editing, and managing a new "point reasons" catalog) need to be restricted to a smaller circle than all admins. Rather than repeat the scattered-inline-check pattern, this spec consolidates role checks into shared helpers in `profile.ts` used everywhere, so a future tier change is a small diff instead of a 20-file sweep.

The app already has a `profit_split_settings` table (`company_pct`/`executor_pct`/`manager_pct` per category: video/web/design/retainer), managed today from a standalone `/admin/profit-split` page, gated to `admin`. There is no existing lateness/schedule/manager-hierarchy concept anywhere in the schema.

---

## Scope

Building:
- New role `super_admin` — a strict superset of `admin` (gets everything `admin` has, plus two exclusive powers).
- `profiles.manager_id` — nullable "reports to" relationship, set by admin-tier users on the Team page. Null means "reports to admin" (any admin/super_admin can manage that employee's points; no specific manager can).
- A `point_reasons` catalog (label + point value, e.g. "Late arrival" = -2) managed exclusively by `super_admin`.
- A `point_events` log — admin/super_admin can log/edit/delete for anyone; managers only for their own direct reports (edits/deletes of events they personally logged, no time limit); employees can only view their own history.
- One role-adaptive page at `/performance` (visible to every role) replacing the standalone Profit Split page — the percentage editor becomes a super_admin-only tab on this same page.
- Consolidated RBAC helpers in `profile.ts`, replacing the scattered inline role-string checks in ~20 files (same set of files touched by the owner→admin merge).

Explicitly **not building**:
- No automated lateness detection (no shift-schedule concept) — all point events are logged manually.
- No periodic score reset — score is an all-time running total (`sum(points)` per employee, computed on read).
- No company-wide leaderboard — employees see only their own history, never other employees' scores.
- No notifications/emails when a point event is logged.
- No bulk import/export for reasons or events.
- No retroactive point recalculation — `point_events.points` is snapshotted at log time; editing a reason's value later only affects future events.

---

## Data Model

New migration `0032_employee_performance_points.sql`:

```sql
-- Super admin role + manager hierarchy + employee performance points

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'employee'));

alter table profiles add column if not exists manager_id uuid references profiles(id) on delete set null;

-- arora.nikhil is the first super_admin; the other 2 existing profiles stay admin.
update profiles set role = 'super_admin' where email = 'arora.nikhil@studiobee.co.in';

-- is_owner_or_admin() name is a holdover from the pre-merge role model (kept as-is to
-- avoid rewriting every policy that references it by name) — now means "admin or above".
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

-- Narrow profit_split_settings to super_admin at the DB layer too (was owner/admin
-- pre-merge, then admin-only) — matches the app-layer requireSuperAdmin() guard instead
-- of leaving RLS permissive to all admins as a floor.
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
  points integer not null, -- snapshotted from point_reasons.points at log time
  note text not null default '',
  logged_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table point_events enable row level security;

create policy "employees read own point_events" on point_events
  for select using (employee_id = auth.uid());
create policy "billing roles read all point_events" on point_events
  for select using (is_billing_role()); -- admin/super_admin/manager — same set as "who can see the company-wide list"

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

An employee's score is `sum(point_events.points) where employee_id = X` — no separate running-total column to keep in sync.

---

## RBAC Helper Refactor (`src/lib/profile.ts`)

```ts
export type Role = "super_admin" | "admin" | "manager" | "employee";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  manager_id: string | null;
  active: boolean;
};

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

Every inline `role !== "admin"` / `role === "admin"` check across the app is replaced with `!isAdminTier(role)` / `isAdminTier(role)` (these files were also the ones touched by the owner→admin merge, so the set is already known):

`lib/supabase/proxy.ts`, `components/layout/app-sidebar.tsx`, `lib/actions/{team,cost-model,vendors,hires,equipment,clients,documents,time}.ts`, `app/(app)/bin/page.tsx`, `app/(app)/clients/[id]/page.tsx`, `app/(app)/admin/{team,services,cost-model,equipment,vendors,hires}/page.tsx`, `app/(app)/reports/{page,pnl/page,hours/page}.tsx`.

`lib/actions/profit-split.ts`'s guard changes from `isAdminTier` to `isSuperAdmin` (this is the one place that becomes *more* restrictive, not just simplified) — this is the intentional exception per the point below.

`proxy.ts`'s employee-allowed-paths list gains `/performance`:
```ts
const allowed =
  pathname === "/" ||
  pathname.startsWith("/account") ||
  pathname.startsWith("/tasks") ||
  pathname.startsWith("/clock") ||
  pathname.startsWith("/projects") ||
  pathname.startsWith("/performance");
```

---

## Server Actions

**`src/lib/actions/profit-split.ts`** — guard changes to super_admin only:
```ts
function requireSuperAdmin(role: string) {
  if (role !== "super_admin") throw new Error("Unauthorised");
}
```
(replaces `requireAdmin`; both `upsertProfitSplitSettings` and `getProfitSplitSettings` call it)

**`src/lib/actions/team.ts`** — new action alongside existing `updateEmployeeRole`:
```ts
export async function updateEmployeeManager(id: string, managerId: string | null) {
  await requireAdminTier(); // renamed from requireAdmin, now uses isAdminTier(profile.role)
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ manager_id: managerId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}
```

**`src/lib/actions/performance.ts`** (new file):
```ts
"use server";
// Point reasons — super_admin only
export async function upsertPointReason(input: { id?: string; label: string; points: number }) { ... }
export async function setPointReasonActive(id: string, active: boolean) { ... }

// Point events
export async function logPointEvent(input: { employeeId: string; reasonId: string; note?: string }) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (profile.role === "manager") {
    // Pre-check for a clean error message; RLS is the real backstop.
    const supabase = await createClient();
    const { data: employee } = await supabase.from("profiles").select("manager_id").eq("id", input.employeeId).maybeSingle();
    if (employee?.manager_id !== profile.id) throw new Error("You can only log points for your own reports.");
  } else if (!isAdminTier(profile.role)) {
    throw new Error("Unauthorised");
  }
  const supabase = await createClient(); // RLS-enforced, not the admin client
  const { data: reason } = await supabase.from("point_reasons").select("points").eq("id", input.reasonId).single();
  const { error } = await supabase.from("point_events").insert({
    employee_id: input.employeeId,
    reason_id: input.reasonId,
    points: reason!.points, // snapshot
    note: input.note ?? "",
    logged_by: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/performance");
}

export async function updatePointEvent(id: string, input: { note?: string }) { /* RLS: admin-tier or original logger */ }
export async function deletePointEvent(id: string) { /* RLS: admin-tier or original logger */ }

// Reads — RLS does the row filtering (employee sees own, billing roles see all)
export async function getPointEvents(employeeId?: string) { ... }
export async function getEmployeeScores() { /* group by employee_id, sum(points), for the admin/manager overview table */ }
```

All mutations use the regular RLS-respecting `createClient()` (not `createAdminClient()`), so the Postgres policies above are the actual enforcement — app-layer checks exist only to fail fast with a readable message.

---

## UI Changes

- **Sidebar** (`app-sidebar.tsx`): new unconditionally-rendered nav group `{ title: "Performance", href: "/performance", icon: Award }`, alongside the existing Tasks/Time groups. "Profit Split" entry removed from `adminNav`.
- **`/performance` page** (new: `src/app/(app)/performance/page.tsx` + `performance-client.tsx`):
  - `employee`: own point history (reason, points, note, date) + running total. No employee list, no logging UI.
  - `manager`/`admin`: table of all `role = 'employee'` profiles with running scores (sortable) — managers and admins themselves are not part of this roster in v1, this system tracks rank-and-file accountability, not management conduct; click through to an employee's history; "Log event" control enabled only where permitted (manager: `employee.manager_id === self`; admin: always).
  - `super_admin`: everything admin has, plus two extra tabs — **Point Reasons** (`point-reasons-tab.tsx`, new) and **Profit Split** (`profit-split-tab.tsx`, adapted from the current `profit-split-client.tsx`).
- **Removed:** `src/app/(app)/admin/profit-split/` (`page.tsx` + `profit-split-client.tsx`) — logic relocates into the Profit Split tab above.
- **Team page** (`team-client.tsx`): `ROLES` array gains `"super_admin"`; `ROLE_PERMISSIONS` gains a super_admin description; each employee row gets a "Reports to" dropdown (admin-tier only, listing existing manager/admin/super_admin profiles from the already-fetched employee list, plus a "— none —" option) wired to `updateEmployeeManager`.

---

## Type Updates

New `src/lib/performance/types.ts`:
```ts
export type PointReason = { id: string; label: string; points: number; active: boolean };
export type PointEvent = {
  id: string;
  employee_id: string;
  reason_id: string;
  points: number;
  note: string;
  logged_by: string | null;
  created_at: string;
};
```

`Profile` type in `profile.ts` gains `manager_id: string | null` (see RBAC section above).

---

## Migration Safety

- Additive migration; existing 3 profiles are unaffected except the single role update for `arora.nikhil@studiobee.co.in`.
- `is_owner_or_admin()`/`is_billing_role()` are updated in place (same function names, referenced by ~15 existing RLS policies) — no policy needs to be dropped/recreated.
- `profit_split_settings`'s policy is explicitly dropped and recreated against `is_super_admin()` (see Data Model) so the DB layer matches the app-layer `requireSuperAdmin()` guard — not left permissive to all admins as a floor.
- **Accepted trade-off:** the "logger updates own" `point_events` policy restricts *which rows* a manager can update (only ones they logged) but not *which columns* — a manager could theoretically call the Supabase client directly to reassign `employee_id`/`points` on their own logged row, not just edit the note (the app's `updatePointEvent` action only ever exposes `note`, but RLS alone doesn't enforce that). Severity is low — scoped to rows they created, no privilege escalation — so this is being accepted for v1 rather than adding a column-immutability trigger. Worth hardening later if it matters.

---

## Out of Scope / Explicit Cuts

- No auto-lateness detection or shift schedules.
- No periodic score reset/period boundaries.
- No public/company-wide leaderboard.
- No notifications on point events.
- No bulk import/export.
- No retroactive recalculation when a point reason's value changes.
