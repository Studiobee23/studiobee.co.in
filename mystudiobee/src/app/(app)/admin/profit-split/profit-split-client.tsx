"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { upsertProfitSplitSettings } from "@/lib/actions/profit-split";
import type { ProfitSplitSettings, ProfitSplitTier } from "@/lib/profit-split/engine";
import { toast } from "sonner";

const CATEGORIES = ["video", "web", "design", "retainer"] as const;

const DEFAULT_TIER: ProfitSplitTier = {
  max: null,
  mode: "simple",
  company_pct: 57,
  executor_pct: 31,
  manager_pct: 12,
};

export function ProfitSplitClient({ settings }: { settings: ProfitSplitSettings[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Record<string, ProfitSplitSettings>>(() =>
    Object.fromEntries(
      settings.map((s) => [s.category, { ...s, tiers: [...s.tiers] }])
    )
  );

  function updateField(cat: string, field: "floor" | "threshold", val: string) {
    setData((d) => ({ ...d, [cat]: { ...d[cat], [field]: parseFloat(val) || 0 } }));
  }

  function updateTier(cat: string, idx: number, field: string, val: string) {
    setData((d) => {
      const tiers = [...d[cat].tiers];
      tiers[idx] = {
        ...tiers[idx],
        [field]: field === "mode" ? val : val === "" ? null : parseFloat(val) || 0,
      };
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
  }

  function addTier(cat: string) {
    setData((d) => {
      const tiers = [...d[cat].tiers];
      const lastIsInfinity = tiers[tiers.length - 1]?.max === null;
      const newTier: ProfitSplitTier = { ...DEFAULT_TIER, max: 100000 };
      if (lastIsInfinity) {
        tiers.splice(tiers.length - 1, 0, newTier);
      } else {
        tiers.push({ ...DEFAULT_TIER, max: null });
      }
      return { ...d, [cat]: { ...d[cat], tiers } };
    });
  }

  function removeTier(cat: string, idx: number) {
    setData((d) => ({
      ...d,
      [cat]: { ...d[cat], tiers: d[cat].tiers.filter((_, i) => i !== idx) },
    }));
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
              <TabsTrigger key={c} value={c} className="capitalize">
                {c}
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map((cat) => {
            const s = data[cat];
            if (!s) return null;
            const isWeb = cat === "web";

            return (
              <TabsContent key={cat} value={cat} className="space-y-6 pt-4">
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Floor (₹)</p>
                    <Input
                      type="number"
                      value={s.floor}
                      onChange={(e) => updateField(cat, "floor", e.target.value)}
                      className="w-36"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Cost-Plus Threshold (₹)
                    </p>
                    <Input
                      type="number"
                      value={s.threshold}
                      onChange={(e) => updateField(cat, "threshold", e.target.value)}
                      className="w-36"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
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
                            <Input
                              type="number"
                              value={tier.max ?? ""}
                              placeholder="∞"
                              onChange={(e) => updateTier(cat, idx, "max", e.target.value)}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={tier.mode}
                              onValueChange={(v) => updateTier(cat, idx, "mode", v)}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="simple">Simple</SelectItem>
                                <SelectItem value="cost-plus">Cost-Plus</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={tier.company_pct}
                              onChange={(e) => updateTier(cat, idx, "company_pct", e.target.value)}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={tier.executor_pct}
                              onChange={(e) => updateTier(cat, idx, "executor_pct", e.target.value)}
                              className="w-20"
                            />
                          </TableCell>
                          {isWeb ? (
                            <>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={tier.origination_pct ?? 0}
                                  onChange={(e) => updateTier(cat, idx, "origination_pct", e.target.value)}
                                  className="w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={tier.client_handling_pct ?? 0}
                                  onChange={(e) => updateTier(cat, idx, "client_handling_pct", e.target.value)}
                                  className="w-20"
                                />
                              </TableCell>
                            </>
                          ) : (
                            <TableCell>
                              <Input
                                type="number"
                                value={tier.manager_pct ?? 0}
                                onChange={(e) => updateTier(cat, idx, "manager_pct", e.target.value)}
                                className="w-20"
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTier(cat, idx)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addTier(cat)}>
                    + Add Tier
                  </Button>
                  <Button size="sm" onClick={() => save(cat)} disabled={pending}>
                    Save
                  </Button>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </>
  );
}
