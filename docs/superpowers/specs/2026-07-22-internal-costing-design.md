# Internal Costing (Equipment tab) — Design Spec
**Date:** 2026-07-22

---

## Context

`mystudiobee` already has an "Overhead Items" concept (`overhead_items` table, managed today from the **Cost Model** admin page at `/admin/cost-model`, alongside **Cost Roles**). An overhead item is `{ name, cost, type: 'per-project' | 'monthly', active }`. Presets (`service_presets`, branded "Services" in the UI at `/admin/services`) can attach a set of overhead items via `default_overhead_ids uuid[]`, plus a single `default_markup_pct` that applies to the whole preset (labor cost + overhead cost combined). When a preset is used to build a quote line item (`quote-editor.tsx`), `computeCostBreakdown()` (`src/lib/costing/engine.ts:25-66`) sums role-hours cost + overhead cost snapshots into `cost_subtotal`, then `priceFromBreakdown()` applies the markup to get the client-facing rate.

Two things confirmed while investigating: (1) the `type` field on `overhead_items` is purely a cosmetic label today — `computeCostBreakdown` adds every attached overhead's `cost` flatly regardless of type, no proration logic exists; (2) the preset-level markup already covers "add markup to these in presets" — no per-item markup exists or is being added.

The user wants this whole concept relabeled and relocated: "Internal Costing" (subscriptions, laptops, anything that isn't billed to a client per-day but still costs the studio to produce work) should live in the **Equipment** tab, not Cost Model — and a laptop-style one-time purchase should be amortized into a monthly cost the same way Equipment already amortizes `purchase_cost` into `daily_rental_cost` (`equipment-client.tsx:56-64`, `deriveRates()`).

---

## Scope

- Extend `overhead_items` (table name unchanged — 6+ files reference it: `engine.ts`, `types.ts`, `profit-split/engine.ts`, `documents.ts`, `reports/pnl`, `quote-editor.tsx`. Renaming the table is pure risk for zero user-visible benefit; only the admin UI moves) with a `costing_type` column replacing the old cosmetic `type` column, plus `purchase_cost`/`useful_life_months` for the new amortized-purchase case.
- Move the item-management UI from the Cost Model page's "Overheads" tab into a new **"Internal Costing"** tab on the Equipment admin page, next to the existing "Equipment" tab.
- Relabel the existing checkbox list on the preset editor (`/admin/services`) from "Default overheads" to "Default internal costing" — this already wires selected items into `default_overhead_ids` and already exposes the preset's markup field, satisfying "add these when making a new service" and "add markup to these in presets" with no new mechanism needed.
- **Not building:** per-item markup (confirmed: single preset-level markup stays), any change to quote-editor.tsx or the costing engine's math (already sums flat costs correctly), any change to `CostBreakdown`/`LineItemMeta` field names (`overhead_id`/`overheads` stay as internal/on-disk names — not user-facing).

---

## Data Model

New migration `0028_internal_costing.sql` (additive + backfill, matches `0022`-`0027` convention):

```sql
alter table overhead_items
  add column if not exists costing_type text not null default 'recurring'
    check (costing_type in ('purchase', 'recurring', 'per_project')),
  add column if not exists purchase_cost numeric(12,2),
  add column if not exists useful_life_months integer;

-- Backfill from the old cosmetic `type` column
update overhead_items set costing_type = 'recurring' where type = 'monthly';
update overhead_items set costing_type = 'per_project' where type = 'per-project';

alter table overhead_items drop column type;
```

`cost` (existing column) remains the single number actually summed by `computeCostBreakdown` — for `costing_type = 'purchase'` it's the auto-derived monthly-equivalent (`purchase_cost / useful_life_months`, editable override after auto-fill, same pattern as `equipment.daily_rental_cost`); for `recurring`/`per_project` it's entered directly, unchanged from today.

RLS: unchanged — already owner/admin-only per `0027_security_hardening.sql`.

---

## Server Actions (`src/lib/actions/cost-model.ts`)

`upsertOverheadItem` (lines 35-51) and `setOverheadItemActive`/`deleteOverheadItem` (lines 53-59, 102-108) move to `src/lib/actions/equipment.ts` (co-located with the tab that now owns this UI, alongside `upsertEquipment`/`setEquipmentActive`):

```ts
export async function upsertOverheadItem(input: {
  id?: string;
  name: string;
  cost: number;
  costing_type: "purchase" | "recurring" | "per_project";
  purchase_cost?: number | null;
  useful_life_months?: number | null;
}) {
  await requireOwnerOrAdmin(); // same guard, copied from cost-model.ts
  const supabase = await createClient();
  const payload = {
    name: input.name,
    cost: input.cost,
    costing_type: input.costing_type,
    purchase_cost: input.purchase_cost ?? null,
    useful_life_months: input.useful_life_months ?? null,
  };
  const { error } = input.id
    ? await supabase.from("overhead_items").update(payload).eq("id", input.id)
    : await supabase.from("overhead_items").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/equipment");
}
```

`revalidatePath` targets change from `/admin/cost-model` to `/admin/equipment` for all three overhead-item actions. `upsertServicePreset`/`deleteServicePreset`/cost-role actions stay in `cost-model.ts` untouched.

---

## UI Changes

**Equipment page** (`src/app/(app)/admin/equipment/page.tsx`): fetch both `equipment` and `overhead_items`, pass both into a new top-level `Tabs` (mirrors `cost-model-client.tsx:42-54`):

```tsx
<Tabs defaultValue="equipment">
  <TabsList>
    <TabsTrigger value="equipment">Equipment</TabsTrigger>
    <TabsTrigger value="internal-costing">Internal Costing</TabsTrigger>
  </TabsList>
  <TabsContent value="equipment"><EquipmentClient items={equipment} /></TabsContent>
  <TabsContent value="internal-costing"><InternalCostingClient items={overheadItems} /></TabsContent>
</Tabs>
```

`EquipmentClient`'s own internal `<DashboardHeader title="Equipment" />` (currently rendered inside it) moves up to wrap the whole tabbed page instead, title changed to something like "Equipment & Internal Costing" — both tabs render below one shared header.

New `InternalCostingClient` (new file `src/app/(app)/admin/equipment/internal-costing-client.tsx`, adapted from `OverheadsTab` in `cost-model-client.tsx:162-`): table columns Name / Costing type / Effective monthly cost / Active. Add/Edit dialog:
- Name (text)
- Costing type (select: "One-time purchase (amortized)" → `purchase`, "Recurring subscription" → `recurring`, "Per-project flat fee" → `per_project`)
- If `purchase`: Purchase cost (₹) + Useful life (months) fields, auto-deriving Monthly cost via the same pattern as `deriveRates()` in `equipment-client.tsx:56-64` (`monthly = purchase_cost / useful_life_months`, rounded to 2dp), shown as an editable field the auto-fill overwrites on input but the user can still hand-edit afterward.
- If `recurring` or `per_project`: Cost (₹) entered directly, no derivation.

**Cost Model page** (`src/app/(app)/admin/cost-model/page.tsx`, `cost-model-client.tsx`): drop the `overheads` fetch and the "Overheads" `TabsTrigger`/`TabsContent`. Since only Roles remains, `CostModelClient` drops the `Tabs` wrapper entirely and renders `RolesTab` directly (no functional change to Roles).

**Preset editor** (`src/app/(app)/admin/services/services-client.tsx:144`): label change only, `"Default overheads"` → `"Default internal costing"`. Checkbox list still iterates the same `overheads: OverheadItem[]` prop (now including the new `costing_type`/`purchase_cost`/`useful_life_months` fields, unused by this component beyond display — could optionally show costing type next to each checkbox for clarity, e.g. "Adobe subscription · Recurring"). `default_overhead_ids` column and preset-level `default_markup_pct` field are unchanged.

**Quote editor** (`quote-editor.tsx`): no changes. Preset selection already resolves `default_overhead_ids` + `default_markup_pct` through the unchanged `computeCostBreakdown`/`priceFromBreakdown` engine functions.

---

## Type Updates

`src/lib/costing/types.ts` — `OverheadItem`:
```ts
export type OverheadItem = {
  id: string;
  name: string;
  cost: number;
  costing_type: "purchase" | "recurring" | "per_project";
  purchase_cost: number | null;
  useful_life_months: number | null;
};
```
(`CostBreakdown.overheads[].{overhead_id,name_snapshot,cost_snapshot}` in `engine.ts:45-54` is unaffected — it only ever snapshots `id`/`name`/`cost`, not the new fields, since those aren't needed once a quote is priced.)

Local `OverheadItem` type aliases in `cost-model-client.tsx` (moving out, deleted) and `services-client.tsx:22` (updated to match) follow suit.

---

## Migration Safety

- `overhead_items.type` is dropped in the same migration after backfill — confirmed via full-repo grep that `type` is read only in `cost-model-client.tsx` (UI, being replaced) and `types.ts`/action inputs (being replaced); no other code branches on it.
- Existing `service_presets.default_overhead_ids` references are untouched — same table, same primary keys, just new/renamed columns.
- Existing quotes/invoices/proformas are unaffected — their `cost_breakdown` is already a frozen snapshot (`role_name_snapshot`, `cost_snapshot`, etc.) and never re-reads `overhead_items` after creation.

---

## Out of Scope / Explicit Cuts

- No per-item markup — single preset-level `default_markup_pct` stays as the only markup control, per user confirmation.
- No proration by project duration for `recurring`/`purchase` items (e.g. a 2-week project doesn't get charged half a month) — matches today's existing flat-add behavior for overhead costs; introducing proration would be a separate, larger change to the costing engine.
- No change to `equipment` table or its own rental-cost line-item mode in quotes — Internal Costing is additive alongside it, not a merge of the two concepts.
- No bulk import/export for internal costing items.
