import { useCallback, useMemo, useState } from "react";
import type {
  IndicatorMetric,
  IndicatorScopeLevel,
  IndicatorStatus,
  ProductSelector,
} from "@/shared/types";
import type { IIndicatorWithProgress } from "./useIndicators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectorKind = ProductSelector["kind"];

export interface IIndicatorFilters {
  selectorKind: SelectorKind | "all";
  metric: IndicatorMetric | "all";
  scopeLevel: IndicatorScopeLevel | "all";
  status: IndicatorStatus | "all";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_FILTERS: IIndicatorFilters = {
  selectorKind: "all",
  metric: "all",
  scopeLevel: "all",
  status: "all",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function countActiveFilters(f: IIndicatorFilters): number {
  let n = 0;
  if (f.selectorKind !== "all") n += 1;
  if (f.metric !== "all") n += 1;
  if (f.scopeLevel !== "all") n += 1;
  if (f.status !== "all") n += 1;
  return n;
}

export function applyFilters(
  items: IIndicatorWithProgress[],
  filters: IIndicatorFilters,
): IIndicatorWithProgress[] {
  return items.filter(({ indicator }) => {
    if (filters.selectorKind !== "all" && indicator.selector.kind !== filters.selectorKind)
      return false;
    if (filters.metric !== "all" && indicator.metric !== filters.metric) return false;
    if (filters.scopeLevel !== "all" && indicator.scopeLevel !== filters.scopeLevel) return false;
    if (filters.status !== "all" && indicator.status !== filters.status) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface IUseIndicatorFiltersResult {
  filters: IIndicatorFilters;
  setFilter: <K extends keyof IIndicatorFilters>(key: K, value: IIndicatorFilters[K]) => void;
  setFilters: (patch: Partial<IIndicatorFilters>) => void;
  resetFilters: () => void;
  activeCount: number;
}

/**
 * Local-state filter hook for the Indicators feature.
 * Mirrors the shape of useGoalsFilters but uses useState (indicators
 * have no URL-synced filter requirements at this stage).
 */
export function useIndicatorFilters(): IUseIndicatorFiltersResult {
  const [filters, setFiltersState] = useState<IIndicatorFilters>(DEFAULT_FILTERS);

  const setFilter = useCallback(
    <K extends keyof IIndicatorFilters>(key: K, value: IIndicatorFilters[K]) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setFilters = useCallback((patch: Partial<IIndicatorFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
  }, []);

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  return { filters, setFilter, setFilters, resetFilters, activeCount };
}
