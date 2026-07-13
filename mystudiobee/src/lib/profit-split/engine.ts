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
  price: number;
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

  const tier =
    tiers.find((t) => t.max === null || price <= t.max) ??
    tiers[tiers.length - 1];

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
      pass_through_cost?: number;
    } | null;
    if (!cb) continue;
    if (cb.overheads) for (const o of cb.overheads) total += o.cost_snapshot;
    if (cb.pass_through_cost) total += cb.pass_through_cost;
  }
  return round2(total);
}
