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
  { id: "o1", name: "Equipment Depreciation", cost: 50, costing_type: "per_project" },
  { id: "o2", name: "Travel", cost: 30, costing_type: "per_project" },
  // Amortized MacBook: cost is its monthly-equivalent (₹16,000/mo), capacity 160 hrs/mo
  // -> hourly rate ₹100/hr.
  { id: "o3", name: "Editor MacBook", cost: 16000, costing_type: "purchase", capacity_hours_per_month: 160 },
];

describe("computeCostBreakdown", () => {
  it("sums labor (rate x hours) and flat (per_project) overheads, snapshotting names/rates", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r1", hours: 8 }, { role_id: "r2", hours: 4 }], overheadHours: [{ overhead_id: "o1", hours: 0 }], markupPct: 40 },
      roles,
      overheads,
    );

    expect(breakdown.role_hours).toEqual([
      { role_id: "r1", role_name_snapshot: "Cinematographer", hourly_rate_snapshot: 25, hours: 8 },
      { role_id: "r2", role_name_snapshot: "Video Editor", hourly_rate_snapshot: 20, hours: 4 },
    ]);
    expect(breakdown.overheads).toEqual([
      {
        overhead_id: "o1",
        name_snapshot: "Equipment Depreciation",
        cost_snapshot: 50,
        hours_snapshot: null,
        hourly_rate_snapshot: null,
      },
    ]);
    // (25*8) + (20*4) + 50 = 200 + 80 + 50 = 330 — a per_project item's cost is flat,
    // hours (0 here) don't affect it.
    expect(breakdown.cost_subtotal).toBe(330);
    expect(breakdown.markup_pct).toBe(40);
  });

  it("bills a purchase/recurring overhead only for the hours it was actually in use", () => {
    // Cinematographer works 16hrs total but only uses the MacBook for the 8 editing hrs.
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r1", hours: 16 }], overheadHours: [{ overhead_id: "o3", hours: 8 }], markupPct: 0 },
      roles,
      overheads,
    );
    expect(breakdown.overheads).toEqual([
      {
        overhead_id: "o3",
        name_snapshot: "Editor MacBook",
        cost_snapshot: 800, // 100/hr * 8h, not the full 16000
        hours_snapshot: 8,
        hourly_rate_snapshot: 100,
      },
    ]);
    // (25*16) + 800 = 400 + 800 = 1200
    expect(breakdown.cost_subtotal).toBe(1200);
  });

  it("ignores role/overhead ids that no longer exist", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "ghost", hours: 10 }], overheadHours: [{ overhead_id: "ghost", hours: 5 }], markupPct: 0 },
      roles,
      overheads,
    );
    expect(breakdown.role_hours).toEqual([]);
    expect(breakdown.overheads).toEqual([]);
    expect(breakdown.cost_subtotal).toBe(0);
  });

  it("is deterministic — same input always produces the same output", () => {
    const input = { roleHours: [{ role_id: "r1", hours: 3 }], overheadHours: [{ overhead_id: "o2", hours: 0 }], markupPct: 25 };
    const a = computeCostBreakdown(input, roles, overheads);
    const b = computeCostBreakdown(input, roles, overheads);
    expect(a).toEqual(b);
  });
});

describe("priceFromBreakdown", () => {
  it("applies markup percentage on top of cost subtotal", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r1", hours: 10 }], overheadHours: [], markupPct: 40 },
      roles,
      overheads,
    );
    // cost_subtotal = 250, +40% = 350
    expect(breakdown.cost_subtotal).toBe(250);
    expect(priceFromBreakdown(breakdown)).toBe(350);
  });

  it("returns the cost subtotal unchanged at 0% markup", () => {
    const breakdown = computeCostBreakdown(
      { roleHours: [{ role_id: "r2", hours: 5 }], overheadHours: [], markupPct: 0 },
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

  it("leaves the total exact when roundTotal is not set", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 1000.4 }],
      discount: 0,
      gstEnabled: false,
      gstRate: 18,
    });
    expect(totals.total).toBe(1000.4);
  });

  it("rounds the total UP to the next whole ₹1,000 when roundTotal is set, without touching subtotal/GST", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 149915.34 }],
      discount: 0,
      gstEnabled: true,
      gstRate: 18,
      roundTotal: true,
    });
    // subtotal 149915.34, GST 26984.76, raw total 176900.1 -> rounds up to 177000
    expect(totals.subtotal).toBe(149915.34);
    expect(totals.gstAmount).toBe(26984.76);
    expect(totals.total).toBe(177000);
  });

  it("never rounds down, even a hair over a multiple of 1000", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 176000.01 }],
      discount: 0,
      gstEnabled: false,
      gstRate: 18,
      roundTotal: true,
    });
    expect(totals.total).toBe(177000);
  });

  it("leaves an exact multiple of 1000 unchanged", () => {
    const totals = computeDocumentTotals({
      lineItems: [{ amount: 176000 }],
      discount: 0,
      gstEnabled: false,
      gstRate: 18,
      roundTotal: true,
    });
    expect(totals.total).toBe(176000);
  });
});

describe("round2", () => {
  it("avoids binary float drift on currency math", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(19.999999999)).toBe(20);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
