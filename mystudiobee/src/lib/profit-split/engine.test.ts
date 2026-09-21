import { describe, it, expect } from "vitest";
import { computeProfitSplit, computeMultiGroupProfitSplit } from "./engine";
import type { ProfitSplitSettings } from "./engine";

const videoSettings: ProfitSplitSettings = {
  id: "video",
  category: "video",
  floor: 8000,
  threshold: 50000,
  tiers: [
    { max: 15000, mode: "simple", company_pct: 47, executor_pct: 40, manager_pct: 13 },
    { max: 50000, mode: "simple", company_pct: 57, executor_pct: 31, manager_pct: 12 },
    { max: null, mode: "cost-plus", company_pct: 66, executor_pct: 26, manager_pct: 8 },
  ],
};

const designSettings: ProfitSplitSettings = {
  id: "design",
  category: "design",
  floor: 1000,
  threshold: 25000,
  tiers: [
    { max: 3000, mode: "simple", company_pct: 42, executor_pct: 45, manager_pct: 13 },
    { max: 10000, mode: "simple", company_pct: 52, executor_pct: 36, manager_pct: 12 },
    { max: 25000, mode: "simple", company_pct: 60, executor_pct: 30, manager_pct: 10 },
    { max: null, mode: "cost-plus", company_pct: 66, executor_pct: 26, manager_pct: 8 },
  ],
};

describe("computeMultiGroupProfitSplit", () => {
  it("computes an independent split per group, each against its own category's tiers", () => {
    const results = computeMultiGroupProfitSplit(
      [
        { groupName: "Video", category: "video", executorId: "vid-exec", price: 10000, laborCost: 0, directCost: 0 },
        { groupName: "Design", category: "design", executorId: "des-exec", price: 30000, laborCost: 5000, directCost: 0 },
      ],
      { video: videoSettings, design: designSettings },
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      groupName: "Video",
      executorId: "vid-exec",
      pool: 10000,
      company: 4700,
      executor: 4000,
      manager: 1300,
    });
    // Design at 30000 is above its 25000 threshold, so cost-plus applies and labour is deducted.
    expect(results[1]).toMatchObject({
      groupName: "Design",
      executorId: "des-exec",
      pool: 25000,
      company: 16500,
      executor: 6500,
      manager: 2000,
    });
  });

  it("skips a group whose category has no settings row instead of throwing", () => {
    const results = computeMultiGroupProfitSplit(
      [{ groupName: "Unknown", category: "nope", executorId: null, price: 10000, laborCost: 0, directCost: 0 }],
      { video: videoSettings },
    );
    expect(results).toEqual([]);
  });

  it("matches a single-group call against computeProfitSplit directly", () => {
    const single = computeProfitSplit({ price: 10000, laborCost: 0, directCost: 0, category: "video" }, videoSettings);
    const [grouped] = computeMultiGroupProfitSplit(
      [{ groupName: "", category: "video", executorId: "e1", price: 10000, laborCost: 0, directCost: 0 }],
      { video: videoSettings },
    );
    expect(grouped).toMatchObject(single);
  });
});
