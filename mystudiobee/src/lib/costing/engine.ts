import type {
  CostRole,
  OverheadItem,
  LineItemCostInput,
  CostBreakdown,
  DocumentTotalsInput,
  DocumentTotals,
} from "./types";

/** Round to 2 decimal places using a half-up rule, avoiding binary-float drift
 * (e.g. 1.005 -> 1.01, not 1.00) for currency math. */
export function round2(value: number): number {
  // A tiny absolute epsilon after scaling, not before — large enough to swallow
  // binary float representation error (e.g. 1.005 stored as 1.00499999999999989),
  // small enough to never change a genuine rounding decision for currency-scale values.
  return Math.round(value * 100 + (value >= 0 ? 1e-9 : -1e-9)) / 100;
}

/**
 * Resolves a preset/manual cost input into a snapshotted breakdown + cost subtotal.
 * Pure function: no I/O, no randomness — same input always produces the same output.
 * `costRoles`/`overheadItems` are the live rows (only ever read server-side by an
 * owner/admin session, or inside the server action that computes prices for managers).
 */
export function computeCostBreakdown(
  input: LineItemCostInput,
  costRoles: CostRole[],
  overheadItems: OverheadItem[],
): CostBreakdown {
  const roleById = new Map(costRoles.map((r) => [r.id, r]));
  const overheadById = new Map(overheadItems.map((o) => [o.id, o]));

  const role_hours = input.roleHours
    .filter((rh) => roleById.has(rh.role_id))
    .map((rh) => {
      const role = roleById.get(rh.role_id)!;
      return {
        role_id: role.id,
        role_name_snapshot: role.name,
        hourly_rate_snapshot: role.hourly_rate,
        hours: rh.hours,
      };
    });

  const overheads = input.overheadIds
    .filter((id) => overheadById.has(id))
    .map((id) => {
      const item = overheadById.get(id)!;
      return {
        overhead_id: item.id,
        name_snapshot: item.name,
        cost_snapshot: item.cost,
      };
    });

  const laborCost = role_hours.reduce((sum, rh) => sum + rh.hourly_rate_snapshot * rh.hours, 0);
  const overheadCost = overheads.reduce((sum, o) => sum + o.cost_snapshot, 0);
  const cost_subtotal = round2(laborCost + overheadCost);

  return {
    role_hours,
    overheads,
    markup_pct: input.markupPct,
    cost_subtotal,
  };
}

/** Client-facing unit price (rate) derived from a cost breakdown's markup. */
export function priceFromBreakdown(breakdown: CostBreakdown): number {
  return round2(breakdown.cost_subtotal * (1 + breakdown.markup_pct / 100));
}

/**
 * What a `manager`-role session is allowed to see for a line item priced via the
 * cost engine: description/rate/amount only. Strips `cost_breakdown` entirely —
 * call this before sending any document payload to a manager-role request.
 */
export function redactCostBreakdown<T extends { cost_breakdown?: unknown }>(
  lineItems: T[],
): Omit<T, "cost_breakdown">[] {
  return lineItems.map(({ cost_breakdown, ...rest }) => rest);
}

/** GST + discount + total for a document, given its line items' amounts. studiobee
 * issues both CGST+SGST (intra-state) and IGST (inter-state) documents, but for a
 * single combined "total GST" figure the split doesn't change the math — gstRate is
 * the full combined rate either way (e.g. 18% whether it's 9+9 CGST/SGST or 18 IGST). */
export function computeDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  const subtotal = round2(input.lineItems.reduce((sum, li) => sum + li.amount, 0));
  const discountAmount =
    input.discountType === "percent" ? round2(subtotal * (input.discount / 100)) : round2(input.discount);
  const afterDiscount = round2(subtotal - discountAmount);
  const gstAmount = input.gstEnabled ? round2(afterDiscount * (input.gstRate / 100)) : 0;
  const total = round2(afterDiscount + gstAmount);

  return { subtotal, discountAmount, gstAmount, total };
}
