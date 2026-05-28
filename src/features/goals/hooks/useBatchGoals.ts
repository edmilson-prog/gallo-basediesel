import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GoalMetric, GoalStatus, ID, IGoal, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { suggestTarget } from "../engine/suggestion";
import { useGoalsWithProgress } from "./useGoalsWithProgress";
import { buildMonthlyGoal, detectMonthConflict } from "../utils/batchGoals";

const STALE_MS = 30_000;

export interface IBatchSeller {
  id: ID;
  name: string;
}

export interface IUseBatchGoalsParams {
  storeId: ID;
  metric: GoalMetric;
  year: number;
}

export interface IBuildGoalsOpts {
  status: GoalStatus;
  rewardDescription?: string;
  createdBy: ID;
}

export interface IUseBatchGoalsResult {
  isLoading: boolean;
  sellers: IBatchSeller[];
  getValue: (sellerId: ID, monthIdx: number) => number | null;
  setValue: (sellerId: ID, monthIdx: number, value: number | null) => void;
  isChecked: (sellerId: ID) => boolean;
  setChecked: (sellerId: ID, value: boolean) => void;
  setAllChecked: (value: boolean) => void;
  hasConflict: (sellerId: ID, monthIdx: number) => boolean;
  suggestionFor: (sellerId: ID) => number;
  annualTotal: (sellerId: ID) => number;
  filledMonths: (sellerId: ID) => number;
  monthHasValue: (monthIdx: number) => boolean;
  applyValue: (value: number, months: number[]) => void;
  applySuggestion: (months: number[]) => void;
  createCount: number;
  skippedCount: number;
  annualGrandTotal: number;
  buildGoalsToCreate: (opts: IBuildGoalsOpts) => IGoal[];
}

export function useBatchGoals(params: IUseBatchGoalsParams): IUseBatchGoalsResult {
  const { storeId, metric, year } = params;
  const sellersProvider = useSellersProvider();

  const sellersQuery = useQuery({
    queryKey: ["batch-goals", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
  });

  const goals = useGoalsWithProgress({ storeId, statuses: ["ativa"] });

  const sellers = useMemo<IBatchSeller[]>(
    () => (sellersQuery.data ?? []).map((s: ISeller) => ({ id: s.id, name: s.fullName })),
    [sellersQuery.data],
  );

  const existingGoals = useMemo<IGoal[]>(() => goals.items.map((i) => i.goal), [goals.items]);

  const [values, setValues] = useState<Record<ID, (number | null)[]>>({});
  const [unchecked, setUnchecked] = useState<Set<ID>>(new Set());

  const getValue = useCallback(
    (sellerId: ID, m: number): number | null => values[sellerId]?.[m] ?? null,
    [values],
  );

  const setValue = useCallback((sellerId: ID, m: number, value: number | null) => {
    setValues((prev) => {
      const existing = prev[sellerId];
      const row = existing ? [...existing] : Array<number | null>(12).fill(null);
      row[m] = value;
      return { ...prev, [sellerId]: row };
    });
  }, []);

  const isChecked = useCallback((sellerId: ID) => !unchecked.has(sellerId), [unchecked]);
  const setChecked = useCallback((sellerId: ID, value: boolean) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (value) next.delete(sellerId);
      else next.add(sellerId);
      return next;
    });
  }, []);
  const setAllChecked = useCallback(
    (value: boolean) => setUnchecked(value ? new Set() : new Set(sellers.map((s) => s.id))),
    [sellers],
  );

  const hasConflict = useCallback(
    (sellerId: ID, monthIdx: number) =>
      detectMonthConflict({ existingGoals, storeId, sellerId, metric, year, monthIdx }),
    [existingGoals, storeId, metric, year],
  );

  const suggestions = useMemo<Record<ID, number>>(() => {
    const out: Record<ID, number> = {};
    for (const s of sellers) {
      out[s.id] = suggestTarget({
        metric,
        level: "individual",
        storeId,
        sellerId: s.id,
        allGoals: existingGoals,
      }).suggestedTarget;
    }
    return out;
  }, [sellers, metric, storeId, existingGoals]);

  const suggestionFor = useCallback((sellerId: ID) => suggestions[sellerId] ?? 0, [suggestions]);

  const annualTotal = useCallback(
    (sellerId: ID): number => {
      const row = values[sellerId];
      return (row ?? []).reduce<number>((a, v) => a + (v ?? 0), 0);
    },
    [values],
  );
  const filledMonths = useCallback(
    (sellerId: ID) => {
      const row = values[sellerId];
      return (row ?? []).filter((v) => v != null).length;
    },
    [values],
  );
  const monthHasValue = useCallback(
    (monthIdx: number) => sellers.some((s) => getValue(s.id, monthIdx) != null),
    [sellers, getValue],
  );

  const applyValue = useCallback(
    (value: number, months: number[]) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const s of sellers) {
          if (unchecked.has(s.id)) continue;
          const existing = next[s.id];
          const row = existing ? [...existing] : Array<number | null>(12).fill(null);
          for (const m of months) {
            if (!hasConflict(s.id, m)) row[m] = value;
          }
          next[s.id] = row;
        }
        return next;
      });
    },
    [sellers, unchecked, hasConflict],
  );

  const applySuggestion = useCallback(
    (months: number[]) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const s of sellers) {
          if (unchecked.has(s.id)) continue;
          const sugg = suggestions[s.id] ?? 0;
          const existing = next[s.id];
          const row = existing ? [...existing] : Array<number | null>(12).fill(null);
          for (const m of months) {
            if (!hasConflict(s.id, m)) row[m] = sugg;
          }
          next[s.id] = row;
        }
        return next;
      });
    },
    [sellers, unchecked, suggestions, hasConflict],
  );

  const { createCount, skippedCount, annualGrandTotal } = useMemo(() => {
    let created = 0;
    let skipped = 0;
    let total = 0;
    for (const s of sellers) {
      if (unchecked.has(s.id)) continue;
      for (let m = 0; m < 12; m += 1) {
        if (hasConflict(s.id, m)) {
          skipped += 1;
          continue;
        }
        const v = getValue(s.id, m);
        if (v != null) {
          created += 1;
          total += v;
        }
      }
    }
    return { createCount: created, skippedCount: skipped, annualGrandTotal: total };
  }, [sellers, unchecked, hasConflict, getValue]);

  const buildGoalsToCreate = useCallback(
    (opts: IBuildGoalsOpts): IGoal[] => {
      const out: IGoal[] = [];
      for (const s of sellers) {
        if (unchecked.has(s.id)) continue;
        for (let m = 0; m < 12; m += 1) {
          if (hasConflict(s.id, m)) continue;
          const v = getValue(s.id, m);
          if (v == null || v <= 0) continue;
          out.push(
            buildMonthlyGoal({
              storeId,
              sellerId: s.id,
              metric,
              year,
              monthIdx: m,
              targetValue: v,
              rewardDescription: opts.rewardDescription,
              status: opts.status,
              createdBy: opts.createdBy,
            }),
          );
        }
      }
      return out;
    },
    [sellers, unchecked, hasConflict, getValue, storeId, metric, year],
  );

  return {
    isLoading: sellersQuery.isLoading || goals.isLoading,
    sellers,
    getValue,
    setValue,
    isChecked,
    setChecked,
    setAllChecked,
    hasConflict,
    suggestionFor,
    annualTotal,
    filledMonths,
    monthHasValue,
    applyValue,
    applySuggestion,
    createCount,
    skippedCount,
    annualGrandTotal,
    buildGoalsToCreate,
  };
}
