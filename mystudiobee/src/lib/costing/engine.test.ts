import { describe, it, expect } from "vitest";
import {
  computeCostBreakdown,
  priceFromBreakdown,
  computeDocumentTotals,
  redactCostBreakdown,
  round2,
} from "./engine";
import type { CostRole, OverheadItem } from "./types";

const roles: CostRole[] = [
  { id: "r1", name: "Cinematographer", hourly_rate: 25 },
  { id: "r2", name: "Video Editor", hourly_rate: 20 },
];

const overheads: OverheadItem[] = [
  { id: "o1", name: "Equipment Depreciation", cost: 50, type: "per-project" },
  { id: "o2", name: "Travel", cost: 30, type: "per-project" },
];

describe("computeCostBreakdown", () => {
  it("sums labor (rate x hours) and overheads, snapshotting names/rates", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r1", hours: 8 }, { role_id: "r2", hours: 4 }], overheadIds: ["o1"], markupPct: 40 },
      roles,
      overheads,
    );

    expect(breakdown.role_hours).toEqual([
      { role_id: "r1", role_name_snapshot: "Cinematographer", hourly_rate_snapshot: 25, hours: 8 },
      { role_id: "r2", role_name_snapshot: "Video Editor", hourly_rate_snapshot: 20, hours: 4 },
    ]);
    expect(breakdown.overheads).toEqual([
      { overhead_id: "o1", name_snapshot: "Equipment Depreciation", cost_snapshot: 50 },
    ]);
    // (25*8) + (20*4) + 50 = 200 + 80 + 50 = 330
    expect(breakdown.cost_subtotal).toBe(330);
    expect(breakdown.markup_pct).toBe(40);
  });

  it("ignores role/overhead ids that no longer exist", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "ghost", hours: 10 }], overheadIds: ["ghost"], markupPct: 0 },
      roles,
      overheads,
    );
    expect(breakdown.role_hours).toEqual([]);
    expect(breakdown.overheads).toEqual([]);
    expect(breakdown.cost_subtotal).toBe(0);
  });

  it("is deterministic — same input always produces the same output", () => {
    const input = { roleHours: [{ role_id: "r1", hours: 3 }], overheadIds: ["o2"], markupPct: 25 };
    const a = computeCostBreakdown(input, roles, overheads);
    const b = computeCostBreakdown(input, roles, overheads);
    expect(a).toEqual(b);
  });
});

describe("priceFromBreakdown", () => {
  it("applies markup percentage on top of cost subtotal", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r1", hours: 10 }], overheadIds: [], markupPct: 40 },
      roles,
      overheads,
    );
    // cost_subtotal = 250, +40% = 350
    expect(breakdown.cost_subtotal).toBe(250);
    expect(priceFromBreakdown(breakdown)).toBe(350);
  });

  it("returns the cost subtotal unchanged at 0% markup", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r2", hours: 5 }], overheadIds: [], markupPct: 0 },
      roles,
      overheads,
    );
    expect(priceFromBreakdown(breakdown)).toBe(breakdown.cost_subtotal);
  });
});

describe("redactCostBreakdown", () => {
  it("strips cost_breakdown from every line item, keeping other fields", () => {
    const lineItems = [
      { description: "Shoot day", qty: 1, cost_breakdown: { role_hours: [], overheads: [], markup_pct: 40, cost_subtotal: 100 }, rate: 140, amount: 140 },
    ];
    const redacted = redactCostBreakdown(lineItems);
    expect(redacted).toEqual([{ description: "Shoot day", qty: 1, rate: 140, amount: 140 }]);
    expect("cost_breakdown" in redacted[0]).toBe(false);
  });
});

describe("computeDocumentTotals", () => {
  it("computes subtotal, GST, and total with no discount", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 1000 }, { amount: 500 }],
      discount: 0,
      gstEnabled: true,
      gstRate: 18,
    });
    expect(totals.subtotal).toBe(1500);
    expect(totals.gstAmount).toBe(270); // 18% of 1500
    expect(totals.total).toBe(1770);
  });

  it("applies discount before computing GST", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 1000 }],
      discount: 100,
      gstEnabled: true,
      gstRate: 18,
    });
    // (1000 - 100) = 900, GST = 162, total = 1062
    expect(totals.subtotal).toBe(1000);
    expect(totals.gstAmount).toBe(162);
    expect(totals.total).toBe(1062);
  });

  it("skips GST entirely when disabled", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 500 }],
      discount: 0,
      gstEnabled: false,
      gstRate: 18,
    });
    expect(totals.gstAmount).toBe(0);
    expect(totals.total).toBe(500);
  });
});

describe("round2", () => {
  it("avoids binary float drift on currency math", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(19.999999999)).toBe(20);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
