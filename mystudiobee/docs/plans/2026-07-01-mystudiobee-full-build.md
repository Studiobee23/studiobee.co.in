# mystudiobee Full Build — Phase 1 (Profit Share) + Phase 2

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add profit-share split tracking, project/lifecycle management, extended line item types, tasks, reports, and quote lump-sum display to mystudiobee.

**Architecture:** Single Supabase migration adds all new tables/columns at once. Features are built track by track — each track is independently usable. Pure engine functions (no I/O) for all calculations, server actions for DB writes, server components fetch data and pass down as props.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + RLS), shadcn/ui, Tailwind CSS, existing patterns in `src/lib/actions/`, `src/lib/costing/engine.ts`.

## Global Constraints
- Never use `transition-all` in CSS
- All monetary values: `numeric(12,2)` in DB, `round2()` helper in TypeScript
- Role gate: owner/admin only for cost/profit data — managers never see it
- PDF (`/api/generate-pdf`) must never include profit split, executor IDs, or cost breakdowns
- RLS on every new table
- Follow existing patterns exactly: server actions in `src/lib/actions/`, pure engines in `src/lib/`, pages in `src/app/(app)/`
- Commit after every task

---

## File Map

**New files to create:**
- `mystudiobee/supabase/migrations/0003_phase1_phase2.sql` — all new tables + columns
- `mystudiobee/src/lib/profit-split/engine.ts` — pure profit split calculator
- `mystudiobee/src/lib/actions/profit-split.ts` — upsert settings action
- `mystudiobee/src/app/(app)/admin/profit-split/page.tsx` — server component
- `mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx` — client UI
- `mystudiobee/src/app/(app)/projects/page.tsx` — project list
- `mystudiobee/src/app/(app)/projects/new/page.tsx` — create project
- `mystudiobee/src/app/(app)/projects/[id]/page.tsx` — project detail + lifecycle
- `mystudiobee/src/app/(app)/projects/[id]/project-detail-client.tsx` — client component
- `mystudiobee/src/app/(app)/tasks/page.tsx` — tasks dashboard
- `mystudiobee/src/app/(app)/tasks/tasks-client.tsx` — task list + status
- `mystudiobee/src/app/(app)/reports/page.tsx` — reports hub
- `mystudiobee/src/app/(app)/reports/pnl/page.tsx` — P&L report
- `mystudiobee/src/app/(app)/reports/hours/page.tsx` — hours consumed vs committed
- `mystudiobee/src/lib/actions/projects.ts` — project CRUD actions
- `mystudiobee/src/lib/actions/tasks.ts` — task CRUD actions

**Files to modify:**
- `mystudiobee/supabase/migrations/` — add 0003
- `mystudiobee/src/lib/actions/documents.ts` — add executor_id/manager_id/profit_split fields, redact in getDocumentForViewer
- `mystudiobee/src/app/(app)/quotes/quote-editor.tsx` — executor/manager selects, profit split panel, lump sum toggle
- `mystudiobee/src/app/(app)/quotes/[id]/page.tsx` — pass teamMembers + splitSettings props
- `mystudiobee/src/app/(app)/quotes/new/page.tsx` — same
- `mystudiobee/src/components/layout/app-sidebar.tsx` — add Projects, Tasks, Reports, Profit Split nav links
- `mystudiobee/src/app/(app)/admin/cost-model/page.tsx` — reference only (pattern to copy)

---

## Task 1: Database Migration

**Files:**
- Create: `mystudiobee/supabase/migrations/0003_phase1_phase2.sql`

- [ ] Create the migration file with this exact content:

```sql
-- ============================================================
-- 0003_phase1_phase2.sql
-- Phase 1: Profit share | Phase 2: Projects, Tasks, Equipment
-- ============================================================

-- ── PROFIT SHARE SETTINGS ────────────────────────────────────
create table if not exists profit_split_settings (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  floor numeric(12,2) not null default 0,
  threshold numeric(12,2) not null default 0,
  tiers jsonb not null default '[]',
  created_at timestamptz default now()
);
alter table profit_split_settings enable row level security;
create policy "owner/admin manage profit_split_settings" on profit_split_settings
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin'))
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin'))
  );

-- Seed default categories
insert into profit_split_settings (category, floor, threshold, tiers) values
('video', 0, 50000, '[{"max":50000,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12},{"max":null,"mode":"cost-plus","company_pct":57,"executor_pct":31,"manager_pct":12}]'),
('web', 0, 50000, '[{"max":50000,"mode":"simple","company_pct":50,"executor_pct":30,"origination_pct":10,"client_handling_pct":10},{"max":null,"mode":"cost-plus","company_pct":50,"executor_pct":30,"origination_pct":10,"client_handling_pct":10}]'),
('design', 0, 50000, '[{"max":50000,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12},{"max":null,"mode":"cost-plus","company_pct":57,"executor_pct":31,"manager_pct":12}]'),
('retainer', 0, 0, '[{"max":null,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12}]')
on conflict (category) do nothing;

-- ── ALTER DOCUMENTS (profit share fields) ────────────────────
alter table documents
  add column if not exists executor_id uuid references profiles(id) on delete set null,
  add column if not exists manager_id uuid references profiles(id) on delete set null,
  add column if not exists client_handler_id uuid references profiles(id) on delete set null,
  add column if not exists profit_split jsonb;

-- ── PROJECTS ──────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  description text default '',
  category text default '',
  type text not null default 'project' check (type in ('project','retainer')),
  status text not null default 'active' check (status in ('active','on_hold','completed','cancelled')),
  est_hours numeric(8,2) default 0,
  start_date date,
  end_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table projects enable row level security;
create policy "billing roles manage projects" on projects
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  );

-- Link documents to projects (optional)
alter table documents add column if not exists project_id uuid references projects(id) on delete set null;

-- ── PROJECT LIFECYCLE STAGES ──────────────────────────────────
create table if not exists project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage text not null check (stage in (
    'needs_analysis','quote','quote_revision','quote_approved',
    'proforma_sent','advance_received','in_progress',
    'second_payment','delivery_checklist','completed'
  )),
  completed_at timestamptz,
  notes text default '',
  created_at timestamptz default now()
);
alter table project_stages enable row level security;
create policy "billing roles manage project_stages" on project_stages
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  );

-- ── TASKS ─────────────────────────────────────────────────────
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text default '',
  status text not null default 'pending' check (status in ('pending','in_progress','delayed','completed')),
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  payment_linked boolean not null default false,
  payment_amount numeric(12,2),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table tasks enable row level security;
create policy "billing roles manage tasks" on tasks
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  );

-- ── EQUIPMENT INVENTORY ───────────────────────────────────────
create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  purchase_date date,
  purchase_cost numeric(12,2),
  gst_amount numeric(12,2),
  receipt_url text,
  daily_rental_cost numeric(12,2) default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table equipment enable row level security;
create policy "owner/admin manage equipment" on equipment
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin'))
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin'))
  );

-- ── MINUTES OF MEETING ────────────────────────────────────────
create table if not exists moms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  content text default '',
  attendees text[] default '{}',
  meeting_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table moms enable row level security;
create policy "billing roles manage moms" on moms
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin','manager'))
  );
```

- [ ] Run this in Supabase SQL Editor → confirm "Success, no rows returned"
- [ ] Commit: `git add mystudiobee/supabase/migrations/0003_phase1_phase2.sql && git commit -m "feat: add phase 1+2 database migration"`

---

## Task 2: Profit Split Engine

**Files:**
- Create: `mystudiobee/src/lib/profit-split/engine.ts`

**Interfaces:**
- Consumes: `round2` from `@/lib/costing/engine`
- Produces: `computeProfitSplit(input, settings) → ProfitSplitResult`

- [ ] Create `mystudiobee/src/lib/profit-split/engine.ts`:

```typescript
import { round2 } from "@/lib/costing/engine";

export type ProfitSplitTier = {
  max: number | null;
  mode: "simple" | "cost-plus";
  company_pct: number;
  executor_pct: number;
  manager_pct?: number;
  origination_pct?: number;
  client_handling_pct?: number;
};

export type ProfitSplitSettings = {
  id: string;
  category: string;
  floor: number;
  threshold: number;
  tiers: ProfitSplitTier[];
};

export type ProfitSplitResult = {
  tier: ProfitSplitTier;
  pool: number;
  company: number;
  executor: number;
  manager?: number;
  origination?: number;
  client_handling?: number;
  is_web: boolean;
};

export type ProfitSplitInput = {
  price: number; // subtotal (ex-GST)
  laborCost: number;
  directCost: number;
  category: string;
};

export function computeProfitSplit(
  input: ProfitSplitInput,
  settings: ProfitSplitSettings
): ProfitSplitResult {
  const { price, laborCost, directCost } = input;
  const tiers = [...settings.tiers].sort((a, b) => {
    if (a.max === null) return 1;
    if (b.max === null) return -1;
    return a.max - b.max;
  });

  const tier = tiers.find((t) => t.max === null || price <= t.max) ?? tiers[tiers.length - 1];
  const pool =
    tier.mode === "simple"
      ? round2(price - directCost)
      : round2(price - laborCost - directCost);

  const is_web = settings.category === "web";

  if (is_web) {
    const company = round2((pool * tier.company_pct) / 100);
    const executor = round2((pool * tier.executor_pct) / 100);
    const origination = round2((pool * (tier.origination_pct ?? 0)) / 100);
    const client_handling = round2((pool * (tier.client_handling_pct ?? 0)) / 100);
    return { tier, pool, company, executor, origination, client_handling, is_web };
  }

  const company = round2((pool * tier.company_pct) / 100);
  const executor = round2((pool * tier.executor_pct) / 100);
  const manager = round2((pool * (tier.manager_pct ?? 0)) / 100);
  return { tier, pool, company, executor, manager, is_web };
}

export function sumLaborCost(lineItems: Array<{ cost_breakdown: unknown }>): number {
  let total = 0;
  for (const item of lineItems) {
    const cb = item.cost_breakdown as {
      role_hours?: Array<{ hourly_rate_snapshot: number; hours: number }>;
    } | null;
    if (!cb?.role_hours) continue;
    for (const r of cb.role_hours) total += r.hourly_rate_snapshot * r.hours;
  }
  return round2(total);
}

export function sumDirectCost(lineItems: Array<{ cost_breakdown: unknown }>): number {
  let total = 0;
  for (const item of lineItems) {
    const cb = item.cost_breakdown as {
      overheads?: Array<{ cost_snapshot: number }>;
    } | null;
    if (!cb?.overheads) continue;
    for (const o of cb.overheads) total += o.cost_snapshot;
  }
  return round2(total);
}
```

- [ ] Commit: `git add mystudiobee/src/lib/profit-split/engine.ts && git commit -m "feat: add profit split pure engine"`

---

## Task 3: Profit Split Server Action + Document Redaction

**Files:**
- Create: `mystudiobee/src/lib/actions/profit-split.ts`
- Modify: `mystudiobee/src/lib/actions/documents.ts`

- [ ] Create `mystudiobee/src/lib/actions/profit-split.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/profile";
import type { ProfitSplitTier } from "@/lib/profit-split/engine";

function requireOwnerOrAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Unauthorised");
}

export async function upsertProfitSplitSettings(input: {
  category: string;
  floor: number;
  threshold: number;
  tiers: ProfitSplitTier[];
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profit_split_settings")
    .upsert({ ...input }, { onConflict: "category" });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/profit-split");
}

export async function getProfitSplitSettings() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profit_split_settings")
    .select("*")
    .order("category");
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

- [ ] In `mystudiobee/src/lib/actions/documents.ts`, find the `createQuote` input type and add these fields. Find the existing `input` type/object for `createQuote` and extend it:

```typescript
// Add to createQuote input type and insert object:
executor_id?: string | null;
manager_id?: string | null;
client_handler_id?: string | null;
profit_split?: unknown;
project_id?: string | null;
```

- [ ] In the same file, find `updateDocument` and add the same nullable fields to its partial update.

- [ ] In `getDocumentForViewer`, find where `cost_breakdown` is stripped for managers and extend the stripping:

```typescript
// After existing cost_breakdown redaction, also strip:
if (!canSeeCost) {
  delete doc.executor_id;
  delete doc.manager_id;
  delete doc.client_handler_id;
  delete doc.profit_split;
}
```

- [ ] Commit: `git add mystudiobee/src/lib/actions/profit-split.ts mystudiobee/src/lib/actions/documents.ts && git commit -m "feat: profit split server actions + document redaction"`

---

## Task 4: Admin Profit Split UI

**Files:**
- Create: `mystudiobee/src/app/(app)/admin/profit-split/page.tsx`
- Create: `mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx`
- Modify: `mystudiobee/src/components/layout/app-sidebar.tsx`

- [ ] Create `mystudiobee/src/app/(app)/admin/profit-split/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { getProfitSplitSettings } from "@/lib/actions/profit-split";
import { ProfitSplitClient } from "./profit-split-client";

export default async function ProfitSplitPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    redirect("/");
  }
  const settings = await getProfitSplitSettings();
  return <ProfitSplitClient settings={settings} />;
}
```

- [ ] Create `mystudiobee/src/app/(app)/admin/profit-split/profit-split-client.tsx` — full client component with:
  - `Tabs` with one tab per category (Video, Web, Design, Retainer)
  - Each tab: Floor input, Threshold input, tier rows table (max, mode, company%, executor%, manager%/origination%/client_handling%)
  - Add tier / Remove tier buttons
  - Save button calling `upsertProfitSplitSettings`
  - Web tab shows Origination + Client Handling columns instead of Manager

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { upsertProfitSplitSettings } from "@/lib/actions/profit-split";
import type { ProfitSplitSettings, ProfitSplitTier } from "@/lib/profit-split/engine";
import { toast } from "sonner";

const CATEGORIES = ["video", "web", "design", "retainer"] as const;

export function ProfitSplitClient({ settings }: { settings: ProfitSplitSettings[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Record<string, ProfitSplitSettings>>(() =>
    Object.fromEntries(settings.map((s) => [s.category, { ...s, tiers: [...s.tiers] }]))
  );

  function updateField(cat: string, field: "floor" | "threshold", val: string) {
    setData((d) => ({ ...d, [cat]: { ...d[cat], [field]: parseFloat(val) || 0 } }));
  }

  function updateTier(cat: string, idx: number, field: string, val: string | number) {
    setData((d) => {
      const tiers = [...d[cat].tiers];
      tiers[idx] = { ...tiers[idx], [field]: val === "" ? null : typeof val === "string" ? parseFloat(val) || 0 : val };
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
  }

  function addTier(cat: string) {
    setData((d) => {
      const tiers = [...d[cat].tiers];
      const last = tiers[tiers.length - 1];
      if (last?.max === null) {
        // insert before the last (null = infinity) tier
        tiers.splice(tiers.length - 1, 0, { max: 0, mode: "simple", company_pct: 57, executor_pct: 31, manager_pct: 12 });
      } else {
        tiers.push({ max: null, mode: "simple", company_pct: 57, executor_pct: 31, manager_pct: 12 });
      }
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
  }

  function removeTier(cat: string, idx: number) {
    setData((d) => {
      const tiers = d[cat].tiers.filter((_, i) => i !== idx);
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
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
    <>
      <DashboardHeader title="Profit Split Settings" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Tabs defaultValue="video">
          <TabsList>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c} className="capitalize">{c}</TabsTrigger>
            ))}
          </TabsList>
          {CATEGORIES.map((cat) => {
            const s = data[cat];
            if (!s) return null;
            const isWeb = cat === "web";
            return (
              <TabsContent key={cat} value={cat} className="space-y-6 pt-4">
                <div className="flex gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Floor (₹)</p>
                    <Input type="number" value={s.floor} onChange={(e) => updateField(cat, "floor", e.target.value)} className="w-36" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Cost-Plus Threshold (₹)</p>
                    <Input type="number" value={s.threshold} onChange={(e) => updateField(cat, "threshold", e.target.value)} className="w-36" />
                  </div>
                </div>

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
                          <Input type="number" value={tier.max ?? ""} placeholder="∞"
                            onChange={(e) => updateTier(cat, idx, "max", e.target.value)}
                            className="w-28" />
                        </TableCell>
                        <TableCell>
                          <Select value={tier.mode} onValueChange={(v) => updateTier(cat, idx, "mode", v)}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="simple">Simple</SelectItem>
                              <SelectItem value="cost-plus">Cost-Plus</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={tier.company_pct} onChange={(e) => updateTier(cat, idx, "company_pct", e.target.value)} className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={tier.executor_pct} onChange={(e) => updateTier(cat, idx, "executor_pct", e.target.value)} className="w-20" />
                        </TableCell>
                        {isWeb ? (
                          <>
                            <TableCell>
                              <Input type="number" value={tier.origination_pct ?? 0} onChange={(e) => updateTier(cat, idx, "origination_pct", e.target.value)} className="w-20" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={tier.client_handling_pct ?? 0} onChange={(e) => updateTier(cat, idx, "client_handling_pct", e.target.value)} className="w-20" />
                            </TableCell>
                          </>
                        ) : (
                          <TableCell>
                            <Input type="number" value={tier.manager_pct ?? 0} onChange={(e) => updateTier(cat, idx, "manager_pct", e.target.value)} className="w-20" />
                          </TableCell>
                        )}
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => removeTier(cat, idx)}>Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addTier(cat)}>+ Add Tier</Button>
                  <Button size="sm" onClick={() => save(cat)} disabled={pending}>Save</Button>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </>
  );
}
```

- [ ] In `app-sidebar.tsx`, add Profit Split to admin nav and add Projects + Tasks + Reports to main nav:

```typescript
// In adminNav array, add:
{ title: "Profit Split", href: "/admin/profit-split", icon: PieChart },

// Add to imports:
import { PieChart, FolderOpen, CheckSquare, BarChart2 } from "lucide-react";

// Add new nav arrays:
const projectNav: NavEntry[] = [
  { title: "Projects", href: "/projects", icon: FolderOpen },
];
const taskNav: NavEntry[] = [
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
];
const reportNav: NavEntry[] = [
  { title: "Reports", href: "/reports", icon: BarChart2 },
];

// In the sidebar content JSX, add these Group components:
<Group label="Projects" items={projectNav} pathname={pathname} />
<Group label="Work" items={taskNav} pathname={pathname} />
{isOwnerOrAdmin && <Group label="Insights" items={reportNav} pathname={pathname} />}
```

- [ ] Commit: `git add mystudiobee/src/app/(app)/admin/profit-split mystudiobee/src/components/layout/app-sidebar.tsx && git commit -m "feat: profit split admin UI + sidebar nav links"`

---

## Task 5: Profit Split in Quote Editor

**Files:**
- Modify: `mystudiobee/src/app/(app)/quotes/[id]/page.tsx`
- Modify: `mystudiobee/src/app/(app)/quotes/new/page.tsx`
- Modify: `mystudiobee/src/app/(app)/quotes/quote-editor.tsx`

- [ ] In `quotes/[id]/page.tsx` and `quotes/new/page.tsx`, add these fetches in the server component alongside existing data fetches:

```typescript
// Add alongside existing supabase queries:
const { data: teamMembers } = await supabase
  .from("profiles")
  .select("id, display_name, email, role")
  .eq("active", true)
  .order("display_name");

const { data: splitSettings } = await supabase
  .from("profit_split_settings")
  .select("*");

// Pass as props to QuoteEditor:
// teamMembers={teamMembers ?? []}
// splitSettings={splitSettings ?? []}
```

- [ ] In `quote-editor.tsx`, add these to the component props type:

```typescript
teamMembers: Array<{ id: string; display_name: string; email: string; role: string }>;
splitSettings: ProfitSplitSettings[];
```

- [ ] Add imports at top of quote-editor.tsx:

```typescript
import { computeProfitSplit, sumLaborCost, sumDirectCost } from "@/lib/profit-split/engine";
import type { ProfitSplitSettings } from "@/lib/profit-split/engine";
```

- [ ] Add executor/manager state and selects inside quote-editor (only rendered when `canSeeCost`):

```typescript
// State:
const [executorId, setExecutorId] = useState<string>(doc?.executor_id ?? "");
const [managerId, setManagerId] = useState<string>(doc?.manager_id ?? "");
const [clientHandlerId, setClientHandlerId] = useState<string>(doc?.client_handler_id ?? "");

// Computed split (live):
const splitSetting = splitSettings.find((s) => s.category === category);
const profitSplit = splitSetting && subtotal > 0
  ? computeProfitSplit(
      { price: subtotal, laborCost: sumLaborCost(lineItems), directCost: sumDirectCost(lineItems), category },
      splitSetting
    )
  : null;
```

- [ ] In the JSX, below the Totals section and only when `canSeeCost`, add:

```tsx
{canSeeCost && (
  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Team Assignment</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Executor</label>
        <Select value={executorId} onValueChange={setExecutorId}>
          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {teamMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {category === "web" ? (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Client Handling</label>
          <Select value={clientHandlerId} onValueChange={setClientHandlerId}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Manager</label>
          <Select value={managerId} onValueChange={setManagerId}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>

    {profitSplit && (
      <div className="space-y-1 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Profit Split · {profitSplit.tier.mode === "cost-plus" ? "Cost-Plus" : "Simple"} · Pool ₹{profitSplit.pool.toLocaleString("en-IN")}
        </p>
        <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-muted-foreground">Company</p>
            <p className="font-medium">₹{profitSplit.company.toLocaleString("en-IN")} ({profitSplit.tier.company_pct}%)</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-muted-foreground">Executor</p>
            <p className="font-medium">₹{profitSplit.executor.toLocaleString("en-IN")} ({profitSplit.tier.executor_pct}%)</p>
          </div>
          {profitSplit.is_web ? (
            <>
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-muted-foreground">Origination</p>
                <p className="font-medium">₹{(profitSplit.origination ?? 0).toLocaleString("en-IN")} ({profitSplit.tier.origination_pct ?? 0}%)</p>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-muted-foreground">Client Handling</p>
                <p className="font-medium">₹{(profitSplit.client_handling ?? 0).toLocaleString("en-IN")} ({profitSplit.tier.client_handling_pct ?? 0}%)</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-muted-foreground">Manager</p>
              <p className="font-medium">₹{(profitSplit.manager ?? 0).toLocaleString("en-IN")} ({profitSplit.tier.manager_pct ?? 0}%)</p>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] Include `executor_id`, `manager_id`, `client_handler_id`, `profit_split` in the save payload passed to `createQuote`/`updateDocument`
- [ ] Commit: `git add mystudiobee/src/app/(app)/quotes && git commit -m "feat: executor/manager assignment + profit split panel in quote editor"`

---

## Task 6: Quote Lump Sum Toggle

**Files:**
- Modify: `mystudiobee/src/app/(app)/quotes/quote-editor.tsx`

- [ ] Add a `lumpsumView` boolean state defaulting to `false`
- [ ] Add a toggle button in the quote header area:

```tsx
<button
  onClick={() => setLumpsumView((v) => !v)}
  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
>
  {lumpsumView ? "Itemised View" : "Summary View"}
</button>
```

- [ ] When `lumpsumView` is true, replace the line items table with a summary card:

```tsx
{lumpsumView ? (
  <div className="rounded-xl border border-border bg-card p-5">
    <p className="font-heading text-2xl font-semibold">
      {doc?.project_name || "Project"} — ₹{total.toLocaleString("en-IN")}
    </p>
    <p className="mt-1 text-sm text-muted-foreground">{lineItems.length} service{lineItems.length !== 1 ? "s" : ""} included</p>
    {gstEnabled && (
      <p className="mt-0.5 text-xs text-muted-foreground">Incl. {gstType === "igst" ? "IGST" : "CGST+SGST"} @ {gstRate}%</p>
    )}
  </div>
) : (
  /* existing line items table */
)}
```

- [ ] Commit: `git add mystudiobee/src/app/(app)/quotes/quote-editor.tsx && git commit -m "feat: lump sum summary toggle on quote editor"`

---

## Task 7: Projects — Actions + List + Create

**Files:**
- Create: `mystudiobee/src/lib/actions/projects.ts`
- Create: `mystudiobee/src/app/(app)/projects/page.tsx`
- Create: `mystudiobee/src/app/(app)/projects/new/page.tsx`

- [ ] Create `mystudiobee/src/lib/actions/projects.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createProject(input: {
  name: string;
  description?: string;
  category?: string;
  type: "project" | "retainer";
  client_id?: string;
  est_hours?: number;
  start_date?: string;
  end_date?: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...input, created_by: profile.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  return data.id as string;
}

export async function updateProject(id: string, input: Partial<{
  name: string;
  description: string;
  category: string;
  type: "project" | "retainer";
  status: "active" | "on_hold" | "completed" | "cancelled";
  client_id: string;
  est_hours: number;
  start_date: string;
  end_date: string;
}>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function completeProjectStage(projectId: string, stage: string, notes?: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_stages").upsert(
    { project_id: projectId, stage, completed_at: new Date().toISOString(), notes: notes ?? "" },
    { onConflict: "project_id,stage" }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function createMom(input: {
  project_id?: string;
  client_id?: string;
  title: string;
  content: string;
  attendees?: string[];
  meeting_date?: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { error } = await supabase.from("moms").insert({ ...input, created_by: profile.id });
  if (error) throw new Error(error.message);
  if (input.project_id) revalidatePath(`/projects/${input.project_id}`);
}
```

- [ ] Create `mystudiobee/src/app/(app)/projects/page.tsx`:

```typescript
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  on_hold: "bg-yellow-500/10 text-yellow-600",
  completed: "bg-blue-500/10 text-blue-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, type, status, category, est_hours, start_date, end_date, clients(name)")
    .order("created_at", { ascending: false });

  return (
    <>
      <DashboardHeader
        title="Projects"
        actions={
          <Link href="/projects/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> New Project
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-2">
          {!projects?.length && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No projects yet — create your first one.
            </div>
          )}
          {projects?.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(p.clients as { name: string } | null)?.name ?? "No client"} · {p.category || p.type}
                  {p.est_hours ? ` · ${p.est_hours}h est.` : ""}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}>
                {p.status.replace("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] Create `mystudiobee/src/app/(app)/projects/new/page.tsx` — a simple server component that renders a client form:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  return <NewProjectForm clients={clients ?? []} />;
}
```

- [ ] Create `mystudiobee/src/app/(app)/projects/new/new-project-form.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/lib/actions/projects";
import { toast } from "sonner";

export function NewProjectForm({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "", description: "", category: "", type: "project" as "project" | "retainer",
    client_id: "", est_hours: "", start_date: "", end_date: "",
  });

  function set(field: string, val: string) { setForm((f) => ({ ...f, [field]: val })); }

  function submit() {
    startTransition(async () => {
      try {
        const id = await createProject({
          name: form.name,
          description: form.description,
          category: form.category,
          type: form.type,
          client_id: form.client_id || undefined,
          est_hours: form.est_hours ? parseFloat(form.est_hours) : undefined,
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
        });
        router.push(`/projects/${id}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <DashboardHeader title="New Project" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Project Name *</label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Brand Identity for Acme" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Type</label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="retainer">Retainer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Client</label>
            <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Category</label>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. branding, video, web" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Description</label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Est. Hours</label>
              <Input type="number" value={form.est_hours} onChange={(e) => set("est_hours", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Start Date</label>
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">End Date</label>
              <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </div>
          </div>
          <Button onClick={submit} disabled={pending || !form.name} className="w-full">
            {pending ? "Creating…" : "Create Project"}
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] Commit: `git add mystudiobee/src/lib/actions/projects.ts mystudiobee/src/app/(app)/projects && git commit -m "feat: projects list, create, and server actions"`

---

## Task 8: Project Detail + Lifecycle

**Files:**
- Create: `mystudiobee/src/app/(app)/projects/[id]/page.tsx`
- Create: `mystudiobee/src/app/(app)/projects/[id]/project-detail-client.tsx`

- [ ] Create `mystudiobee/src/app/(app)/projects/[id]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectDetailClient } from "./project-detail-client";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: stages }, { data: tasks }, { data: moms }, { data: documents }] = await Promise.all([
    supabase.from("projects").select("*, clients(id, name)").eq("id", id).single(),
    supabase.from("project_stages").select("*").eq("project_id", id).order("created_at"),
    supabase.from("tasks").select("*, profiles(display_name, email)").eq("project_id", id).order("created_at"),
    supabase.from("moms").select("*").eq("project_id", id).order("meeting_date", { ascending: false }),
    supabase.from("documents").select("id, type, number, status, total, created_at").eq("project_id", id).order("created_at", { ascending: false }),
  ]);

  if (!project) notFound();
  return <ProjectDetailClient project={project} stages={stages ?? []} tasks={tasks ?? []} moms={moms ?? []} documents={documents ?? []} />;
}
```

- [ ] Create `mystudiobee/src/app/(app)/projects/[id]/project-detail-client.tsx` with:
  - Project header (name, client, status badge, edit inline)
  - Lifecycle stepper showing the 9 stages as a horizontal progress indicator — completed stages shown in blue, current in ring, future greyed out
  - Click a stage to mark it complete (calls `completeProjectStage`)
  - Tasks section: list of tasks with status badges, add task inline form
  - MOMs section: list of meeting notes, add MOM dialog
  - Linked documents section: list of quotes/invoices/receipts with links

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { completeProjectStage, updateProject, createMom } from "@/lib/actions/projects";
import { createTask, updateTaskStatus } from "@/lib/actions/tasks";
import { Check } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const LIFECYCLE_STAGES = [
  { key: "needs_analysis", label: "Needs Analysis" },
  { key: "quote", label: "Quote" },
  { key: "quote_revision", label: "Quote Revision" },
  { key: "quote_approved", label: "Quote Approved" },
  { key: "proforma_sent", label: "Proforma Sent" },
  { key: "advance_received", label: "Advance Received" },
  { key: "in_progress", label: "In Progress" },
  { key: "second_payment", label: "2nd Payment" },
  { key: "delivery_checklist", label: "Delivery" },
  { key: "completed", label: "Completed" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  delayed: "bg-red-500/10 text-red-600",
  completed: "bg-green-500/10 text-green-600",
};

type Project = {
  id: string; name: string; description: string; category: string;
  type: string; status: string; est_hours: number | null;
  start_date: string | null; end_date: string | null;
  clients: { id: string; name: string } | null;
};

export function ProjectDetailClient({
  project, stages, tasks, moms, documents,
}: {
  project: Project;
  stages: Array<{ stage: string; completed_at: string | null; notes: string }>;
  tasks: Array<{ id: string; title: string; status: string; due_date: string | null; profiles: { display_name: string; email: string } | null }>;
  moms: Array<{ id: string; title: string; content: string; meeting_date: string | null }>;
  documents: Array<{ id: string; type: string; number: string; status: string; total: number }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const completedStages = new Set(stages.filter((s) => s.completed_at).map((s) => s.stage));

  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [showMomForm, setShowMomForm] = useState(false);
  const [momForm, setMomForm] = useState({ title: "", content: "", meeting_date: "" });

  function markStage(stageKey: string) {
    startTransition(async () => {
      try {
        await completeProjectStage(project.id, stageKey);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  }

  function addTask() {
    if (!newTask.title.trim()) return;
    startTransition(async () => {
      try {
        await createTask({ project_id: project.id, title: newTask.title, due_date: newTask.due_date || undefined });
        setNewTask({ title: "", due_date: "" });
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  }

  function addMom() {
    startTransition(async () => {
      try {
        await createMom({ project_id: project.id, ...momForm });
        setShowMomForm(false);
        setMomForm({ title: "", content: "", meeting_date: "" });
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  }

  return (
    <>
      <DashboardHeader title={project.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

        {/* Lifecycle Stepper */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Project Lifecycle</p>
          <div className="flex flex-wrap gap-2">
            {LIFECYCLE_STAGES.map((s) => {
              const done = completedStages.has(s.key);
              return (
                <button key={s.key} onClick={() => !done && markStage(s.key)} disabled={pending}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all
                    ${done ? "bg-primary text-primary-foreground" : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  {done && <Check className="h-3 w-3" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tasks</p>
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.due_date && <p className="text-xs text-muted-foreground">Due {t.due_date}</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[t.status]}`}>
                {t.status.replace("_", " ")}
              </span>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="New task..." value={newTask.title} onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))} className="flex-1" />
            <Input type="date" value={newTask.due_date} onChange={(e) => setNewTask((f) => ({ ...f, due_date: e.target.value }))} className="w-36" />
            <Button size="sm" onClick={addTask} disabled={pending}>Add</Button>
          </div>
        </div>

        {/* MOMs */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Minutes of Meeting</p>
            <Button variant="outline" size="sm" onClick={() => setShowMomForm((v) => !v)}>+ MOM</Button>
          </div>
          {showMomForm && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Input placeholder="Title" value={momForm.title} onChange={(e) => setMomForm((f) => ({ ...f, title: e.target.value }))} />
              <Textarea placeholder="Notes / action items..." value={momForm.content} onChange={(e) => setMomForm((f) => ({ ...f, content: e.target.value }))} rows={3} />
              <Input type="date" value={momForm.meeting_date} onChange={(e) => setMomForm((f) => ({ ...f, meeting_date: e.target.value }))} />
              <Button size="sm" onClick={addMom} disabled={pending}>Save MOM</Button>
            </div>
          )}
          {moms.map((m) => (
            <div key={m.id} className="rounded-lg border border-border px-3 py-2">
              <p className="text-sm font-medium">{m.title}</p>
              {m.meeting_date && <p className="text-[10px] text-muted-foreground">{m.meeting_date}</p>}
              <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{m.content}</p>
            </div>
          ))}
        </div>

        {/* Linked Documents */}
        {documents.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Documents</p>
            {documents.map((d) => (
              <Link key={d.id} href={`/${d.type}s/${d.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                <span className="text-xs font-medium capitalize">{d.type} {d.number}</span>
                <span className="text-xs text-muted-foreground capitalize">{d.status}</span>
                <span className="ml-auto text-xs font-medium">₹{d.total?.toLocaleString("en-IN")}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] Commit: `git add mystudiobee/src/app/(app)/projects/[id] && git commit -m "feat: project detail page with lifecycle, tasks, MOMs, and linked documents"`

---

## Task 9: Tasks Actions + Dashboard

**Files:**
- Create: `mystudiobee/src/lib/actions/tasks.ts`
- Create: `mystudiobee/src/app/(app)/tasks/page.tsx`
- Create: `mystudiobee/src/app/(app)/tasks/tasks-client.tsx`

- [ ] Create `mystudiobee/src/lib/actions/tasks.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createTask(input: {
  project_id?: string;
  title: string;
  description?: string;
  assignee_id?: string;
  due_date?: string;
  payment_linked?: boolean;
  payment_amount?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({ ...input, created_by: profile.id });
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  if (input.project_id) revalidatePath(`/projects/${input.project_id}`);
}

export async function updateTaskStatus(id: string, status: "pending" | "in_progress" | "delayed" | "completed") {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}
```

- [ ] Create `mystudiobee/src/app/(app)/tasks/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, projects(name), profiles(display_name, email)")
    .order("due_date", { ascending: true, nullsFirst: false });

  return <TasksClient tasks={tasks ?? []} />;
}
```

- [ ] Create `mystudiobee/src/app/(app)/tasks/tasks-client.tsx`:

```typescript
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { toast } from "sonner";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  delayed: "bg-red-500/10 text-red-600",
  completed: "bg-green-500/10 text-green-600",
};

type Task = {
  id: string; title: string; status: string; due_date: string | null;
  payment_linked: boolean; payment_amount: number | null;
  projects: { name: string } | null;
  profiles: { display_name: string; email: string } | null;
};

export function TasksClient({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const stats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    delayed: tasks.filter((t) => t.status === "delayed").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  function changeStatus(id: string, status: string) {
    startTransition(async () => {
      try {
        await updateTaskStatus(id, status as "pending" | "in_progress" | "delayed" | "completed");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  }

  return (
    <>
      <DashboardHeader title="Tasks" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(stats).map(([key, count]) => (
            <div key={key} className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-heading text-2xl font-semibold">{count}</p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">{key.replace("_", " ")}</p>
            </div>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {!tasks.length && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No tasks yet. Create tasks from within a project.
            </div>
          )}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.projects ? <Link href="#" className="hover:underline">{t.projects.name}</Link> : "No project"}
                  {t.due_date ? ` · Due ${t.due_date}` : ""}
                  {t.payment_linked ? ` · ₹${t.payment_amount?.toLocaleString("en-IN")} payment` : ""}
                </p>
              </div>
              <Select value={t.status} onValueChange={(v) => changeStatus(t.id, v)} disabled={pending}>
                <SelectTrigger className={`w-32 text-xs ${STATUS_COLORS[t.status]}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] Commit: `git add mystudiobee/src/lib/actions/tasks.ts mystudiobee/src/app/(app)/tasks && git commit -m "feat: tasks dashboard with status stats and inline status updates"`

---

## Task 10: Reports — P&L + Hours

**Files:**
- Create: `mystudiobee/src/app/(app)/reports/page.tsx`
- Create: `mystudiobee/src/app/(app)/reports/pnl/page.tsx`
- Create: `mystudiobee/src/app/(app)/reports/hours/page.tsx`

- [ ] Create `mystudiobee/src/app/(app)/reports/page.tsx`:

```typescript
import Link from "next/link";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";

export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) redirect("/");

  return (
    <>
      <DashboardHeader title="Reports" />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <Link href="/reports/pnl" className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40 transition-colors">
            <p className="font-heading text-lg font-semibold">P&L Report</p>
            <p className="mt-1 text-sm text-muted-foreground">Revenue, costs, and profit per project or period.</p>
          </Link>
          <Link href="/reports/hours" className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40 transition-colors">
            <p className="font-heading text-lg font-semibold">Hours Report</p>
            <p className="mt-1 text-sm text-muted-foreground">Estimated vs consumed hours per project.</p>
          </Link>
        </div>
      </div>
    </>
  );
}
```

- [ ] Create `mystudiobee/src/app/(app)/reports/pnl/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { sumLaborCost, sumDirectCost } from "@/lib/profit-split/engine";

export default async function PnlReportPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) redirect("/");

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, type, number, project_name, status, total, subtotal, line_items, clients(name), project_id, projects(name)")
    .in("type", ["invoice", "receipt"])
    .in("status", ["paid", "accepted"])
    .order("created_at", { ascending: false });

  const rows = (docs ?? []).map((d) => {
    const labor = sumLaborCost(d.line_items ?? []);
    const direct = sumDirectCost(d.line_items ?? []);
    const revenue = d.total ?? 0;
    const cost = labor + direct;
    const profit = revenue - cost;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    return { ...d, labor, direct, cost, profit, margin };
  });

  const totals = rows.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, profit: acc.profit + r.profit }),
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <>
      <DashboardHeader title="P&L Report" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Revenue", value: totals.revenue },
            { label: "Cost", value: totals.cost },
            { label: "Profit", value: totals.profit },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-heading text-xl font-semibold">₹{s.value.toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Document", "Client", "Revenue", "Labor Cost", "Direct Cost", "Profit", "Margin"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="bg-card hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{(r.clients as { name: string } | null)?.name ?? "—"}</td>
                  <td className="px-4 py-3">₹{r.revenue.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">₹{r.labor.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted-foreground">₹{r.direct.toLocaleString("en-IN")}</td>
                  <td className={`px-4 py-3 font-medium ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>₹{r.profit.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{r.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
```

- [ ] Create `mystudiobee/src/app/(app)/reports/hours/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default async function HoursReportPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) redirect("/");

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, est_hours, status, clients(name)")
    .order("created_at", { ascending: false });

  const { data: docs } = await supabase
    .from("documents")
    .select("project_id, line_items")
    .not("project_id", "is", null);

  // Sum consumed hours per project from cost breakdowns
  const consumedByProject: Record<string, number> = {};
  for (const doc of docs ?? []) {
    if (!doc.project_id) continue;
    for (const item of doc.line_items ?? []) {
      const cb = item.cost_breakdown as { role_hours?: Array<{ hours: number }> } | null;
      if (!cb?.role_hours) continue;
      const hrs = cb.role_hours.reduce((s: number, r: { hours: number }) => s + r.hours, 0);
      consumedByProject[doc.project_id] = (consumedByProject[doc.project_id] ?? 0) + hrs;
    }
  }

  return (
    <>
      <DashboardHeader title="Hours Report" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Project", "Client", "Est. Hours", "Consumed Hours", "Remaining", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(projects ?? []).map((p) => {
                const est = p.est_hours ?? 0;
                const consumed = consumedByProject[p.id] ?? 0;
                const remaining = est - consumed;
                return (
                  <tr key={p.id} className="bg-card hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(p.clients as { name: string } | null)?.name ?? "—"}</td>
                    <td className="px-4 py-3">{est > 0 ? `${est}h` : "—"}</td>
                    <td className="px-4 py-3">{consumed > 0 ? `${consumed}h` : "—"}</td>
                    <td className={`px-4 py-3 font-medium ${est > 0 && remaining < 0 ? "text-red-600" : ""}`}>
                      {est > 0 ? `${remaining}h` : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{p.status.replace("_", " ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
```

- [ ] Commit: `git add mystudiobee/src/app/(app)/reports && git commit -m "feat: P&L and hours reports"`

---

## Task 11: Equipment Inventory Admin

**Files:**
- Create: `mystudiobee/src/lib/actions/equipment.ts`
- Create: `mystudiobee/src/app/(app)/admin/equipment/page.tsx`
- Create: `mystudiobee/src/app/(app)/admin/equipment/equipment-client.tsx`
- Modify: `mystudiobee/src/components/layout/app-sidebar.tsx`

- [ ] Create `mystudiobee/src/lib/actions/equipment.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/profile";

function requireOwnerOrAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Unauthorised");
}

export async function upsertEquipment(input: {
  id?: string;
  name: string;
  description?: string;
  purchase_date?: string;
  purchase_cost?: number;
  gst_amount?: number;
  receipt_url?: string;
  daily_rental_cost?: number;
}) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = input.id
    ? await supabase.from("equipment").update(input).eq("id", input.id)
    : await supabase.from("equipment").insert(input);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}

export async function setEquipmentActive(id: string, active: boolean) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  requireOwnerOrAdmin(profile.role);
  const supabase = createAdminClient();
  const { error } = await supabase.from("equipment").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}
```

- [ ] Create `mystudiobee/src/app/(app)/admin/equipment/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { EquipmentClient } from "./equipment-client";

export default async function EquipmentPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) redirect("/");
  const supabase = createAdminClient();
  const { data } = await supabase.from("equipment").select("*").order("name");
  return <EquipmentClient items={data ?? []} />;
}
```

- [ ] Create `mystudiobee/src/app/(app)/admin/equipment/equipment-client.tsx` — mirrors cost-model-client pattern: table of equipment with Add/Edit dialogs, toggle active, fields: name, description, purchase_date, purchase_cost, gst_amount, receipt_url, daily_rental_cost. (Follow exact same structure as `cost-model-client.tsx`'s RolesTab — Table + Dialog + Input fields.)

- [ ] Add Equipment to admin sidebar nav:

```typescript
// In adminNav array:
{ title: "Equipment", href: "/admin/equipment", icon: Package },
// Add to imports: import { Package } from "lucide-react";
```

- [ ] Commit: `git add mystudiobee/src/lib/actions/equipment.ts mystudiobee/src/app/(app)/admin/equipment mystudiobee/src/components/layout/app-sidebar.tsx && git commit -m "feat: equipment inventory admin"`

---

## Task 12: Final Push + TypeScript Check

- [ ] Run TypeScript check from mystudiobee directory:

```bash
cd mystudiobee && npx tsc --noEmit
```

- [ ] Fix any type errors (common: missing `await` on `params`, untyped Supabase join results, missing prop types)
- [ ] Push all commits: `git push origin master`
- [ ] Verify Vercel build passes in dashboard

---

## Feature Guide (Final State)

| Where | What |
|-------|------|
| `/` | Dashboard |
| `/clients` | CRM |
| `/projects` | All projects + retainers |
| `/projects/new` | Create project |
| `/projects/[id]` | Lifecycle, tasks, MOMs, linked docs |
| `/tasks` | Cross-project task dashboard |
| `/quotes/new` | Create quote (with profit split if owner/admin) |
| `/quotes/[id]` | Edit quote, lump sum toggle, PDF |
| `/invoices/[id]` | Invoice detail + PDF |
| `/receipts/[id]` | Receipt + PDF |
| `/reports` | Reports hub |
| `/reports/pnl` | P&L per invoice/receipt |
| `/reports/hours` | Est vs consumed hours per project |
| `/admin/team` | Team + invites |
| `/admin/cost-model` | Roles, overheads, presets |
| `/admin/profit-split` | Profit split tiers per category |
| `/admin/equipment` | Equipment inventory |
