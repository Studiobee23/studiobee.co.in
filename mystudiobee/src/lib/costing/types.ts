export type CostRole = {
  id: string;
  name: string;
  hourly_rate: number;
};

export type OverheadItem = {
  id: string;
  name: string;
  cost: number;
  // Optional: not selected by every caller (the pricing engine only ever needs
  // id/name/cost), but present when the admin UI fetches full rows.
  costing_type?: "purchase" | "recurring" | "per_project";
  // Only meaningful for purchase/recurring items — converts the monthly `cost` into
  // an hourly rate (cost / capacity_hours_per_month) so a line item can bill just the
  // hours the item was actually in use. per_project items ignore this and stay flat.
  capacity_hours_per_month?: number | null;
  purchase_cost?: number | null;
  useful_life_months?: number | null;
  billing_period?: "monthly" | "quarterly" | "annual" | null;
  recurring_amount?: number | null;
};

export type RoleHoursInput = {
  role_id: string;
  hours: number;
};

export type OverheadHoursInput = {
  overhead_id: string;
  // Hours the overhead was in use on this line item. Ignored for per_project items
  // (their cost is always applied in full regardless of hours).
  hours: number;
};

export type LineItemCostInput = {
  roleHours: RoleHoursInput[];
  overheadHours: OverheadHoursInput[];
  markupPct: number;
};

/** Snapshotted cost breakdown — stored verbatim on the document's line item so later
 * rate changes never rewrite a quote's history. */
export type CostBreakdown = {
  role_hours: Array<{
    role_id: string;
    role_name_snapshot: string;
    hourly_rate_snapshot: number;
    hours: number;
  }>;
  overheads: Array<{
    overhead_id: string;
    name_snapshot: string;
    cost_snapshot: number;
    // Present only when the item was hour-scaled (purchase/recurring with a capacity
    // set) — null for a flat per_project item, where the full cost always applies.
    hours_snapshot: number | null;
    hourly_rate_snapshot: number | null;
  }>;
  markup_pct: number;
  cost_subtotal: number;
  /** Cost paid out to an external vendor (rental house, freelancer) — excluded from the
   * profit-split pool since it never belonged to the company/team, only the markup does. */
  pass_through_cost?: number;
};

/** Snapshot of whichever "Add line item" tab built this item, plus the raw inputs
 * entered in it — lets the edit dialog reopen the same tab pre-filled instead of
 * only exposing description/qty/rate. Items saved before this existed (or built
 * via a mode not captured here) simply have no `meta`, and edit falls back to Manual. */
export type LineItemMeta =
  | {
      mode: "preset";
      presetId: string;
      hours: Record<string, string>;
      overheadHours: OverheadHoursInput[];
      markupPct: number;
    }
  // baseCost/markupPct are optional so items saved before Manual had a markup field
  // (just `{ mode: "manual" }`) still load — the edit dialog falls back to cost =
  // the item's existing rate and markup = 0, reproducing the same rate exactly.
  | { mode: "manual"; baseCost?: number; markupPct?: number }
  | { mode: "equipment"; equipmentId: string; days: number; units: number; markupPct: number }
  | { mode: "external_equipment"; name: string; rate: number; days: number; units: number; markupPct: number }
  | { mode: "external_hire"; name: string; rate: number; days: number; markupPct: number }
  | { mode: "studio"; description: string; dailyRate: number; days: number; markupPct: number }
  | { mode: "boost"; platform: string; budget: number; markupPct: number };

export type LineItem = {
  description: string;
  qty: number;
  cost_breakdown: CostBreakdown | null;
  rate: number;
  amount: number;
  /** Grouped-view bucket label. Only assigned via the grouped-view editor; null/absent means "unassigned". */
  group?: string | null;
  meta?: LineItemMeta | null;
};

export type GstType = "cgst_sgst" | "igst";

export type DiscountType = "flat" | "percent";

export type DocumentTotalsInput = {
  lineItems: Array<{ amount: number }>;
  discount: number;
  discountType?: DiscountType;
  gstEnabled: boolean;
  gstRate: number;
  /** Round the final total UP to the next whole ₹1,000 (ceiling, never down/nearest).
   * Subtotal/discount/GST stay at 2-decimal precision — only the grand total is affected. */
  roundTotal?: boolean;
};

export type DocumentTotals = {
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  total: number;
};
