export type CostRole = {
  id: string;
  name: string;
  hourly_rate: number;
};

export type OverheadItem = {
  id: string;
  name: string;
  cost: number;
  type: "per-project" | "monthly";
};

export type RoleHoursInput = {
  role_id: string;
  hours: number;
};

export type LineItemCostInput = {
  roleHours: RoleHoursInput[];
  overheadIds: string[];
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
  }>;
  markup_pct: number;
  cost_subtotal: number;
};

export type LineItem = {
  description: string;
  qty: number;
  cost_breakdown: CostBreakdown | null;
  rate: number;
  amount: number;
};

export type GstType = "cgst_sgst" | "igst";

export type DiscountType = "flat" | "percent";

export type DocumentTotalsInput = {
  lineItems: Array<{ amount: number }>;
  discount: number;
  discountType?: DiscountType;
  gstEnabled: boolean;
  gstRate: number;
};

export type DocumentTotals = {
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  total: number;
};
