import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";

/** Period preset (in months) for the ABC curve aggregation. */
export type ABCPeriodPreset = "3m" | "6m" | "12m" | "24m" | "custom";

export interface IABCFiltersState {
  period: ABCPeriodPreset;
  fromIso?: string;
  toIso?: string;
  store: ID | "all";
  seller: ID | "all";
}

export interface IABCWindow {
  fromIso: string;
  toIso: string;
}

const VALID_PERIOD = new Set<ABCPeriodPreset>(["3m", "6m", "12m", "24m", "custom"]);

export const DEFAULT_ABC_FILTERS: IABCFiltersState = {
  period: "12m",
  store: "all",
  seller: "all",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function presetMonths(preset: ABCPeriodPreset, fallback = 12): number {
  switch (preset) {
    case "3m":
      return 3;
    case "6m":
      return 6;
    case "12m":
      return 12;
    case "24m":
      return 24;
    default:
      return fallback;
  }
}

/** Compute the current or previous window for an ABC preset. */
export function resolveABCWindow(
  filters: IABCFiltersState,
  scope: "current" | "previous",
  now: Date = new Date(),
): IABCWindow {
  if (filters.period === "custom" && filters.fromIso && filters.toIso) {
    const from = new Date(filters.fromIso).getTime();
    const to = new Date(filters.toIso).getTime();
    const span = Math.max(0, to - from);
    if (scope === "current") {
      return { fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() };
    }
    return {
      fromIso: new Date(from - span - 1).toISOString(),
      toIso: new Date(from - 1).toISOString(),
    };
  }
  const months = presetMonths(filters.period);
  const end = now;
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  if (scope === "current") {
    return { fromIso: start.toISOString(), toIso: end.toISOString() };
  }
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start);
  prevStart.setMonth(prevStart.getMonth() - months);
  return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
}

/** Total days in a window (≥ 1). */
export function totalDaysInWindow(window: IABCWindow): number {
  const start = new Date(window.fromIso).getTime();
  const end = new Date(window.toIso).getTime();
  return Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
}

export interface IABCFiltersSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
  vendedor?: string;
}

export function validateABCSearch(raw: Record<string, unknown>): IABCFiltersSearch {
  const out: IABCFiltersSearch = {};
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as ABCPeriodPreset)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.de === "string" && raw.de.length > 0) out.de = raw.de;
  if (typeof raw.ate === "string" && raw.ate.length > 0) out.ate = raw.ate;
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  return out;
}

function readState(
  search: IABCFiltersSearch,
  ctx: { gestorLockedStoreId?: ID; sellerLockedId?: ID },
): IABCFiltersState {
  const period = (search.periodo as ABCPeriodPreset | undefined) ?? DEFAULT_ABC_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_ABC_FILTERS.store,
    seller: ctx.sellerLockedId ?? search.vendedor ?? DEFAULT_ABC_FILTERS.seller,
  };
}

function countActive(
  filters: IABCFiltersState,
  storeLocked: boolean,
  sellerLocked: boolean,
): number {
  let n = 0;
  if (filters.period !== DEFAULT_ABC_FILTERS.period) n += 1;
  if (!storeLocked && filters.store !== DEFAULT_ABC_FILTERS.store) n += 1;
  if (!sellerLocked && filters.seller !== DEFAULT_ABC_FILTERS.seller) n += 1;
  return n;
}

export interface IUseABCFiltersResult {
  filters: IABCFiltersState;
  window: IABCWindow;
  previousWindow: IABCWindow;
  setPeriod: (period: ABCPeriodPreset, customRange?: { from: string; to: string }) => void;
  setStore: (store: ID | "all") => void;
  setSeller: (seller: ID | "all") => void;
  reset: () => void;
  activeCount: number;
}

const ROUTE_ID = "/app/gestao/abc" as const;

export function useABCFilters(ctx: {
  gestorLockedStoreId?: ID;
  sellerLockedId?: ID;
}): IUseABCFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IABCFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<IABCFiltersSearch>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const next: IABCFiltersSearch = {
            ...(prev as IABCFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IABCFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod = useCallback<IUseABCFiltersResult["setPeriod"]>(
    (period, customRange) => {
      if (period === DEFAULT_ABC_FILTERS.period) {
        apply({ periodo: undefined, de: undefined, ate: undefined });
        return;
      }
      if (period === "custom" && customRange) {
        apply({ periodo: "custom", de: customRange.from, ate: customRange.to });
        return;
      }
      apply({ periodo: period, de: undefined, ate: undefined });
    },
    [apply],
  );

  const window = useMemo(() => resolveABCWindow(filters, "current"), [filters]);
  const previousWindow = useMemo(() => resolveABCWindow(filters, "previous"), [filters]);

  return {
    filters,
    window,
    previousWindow,
    setPeriod,
    setStore: (v) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: v === "all" ? undefined : v });
    },
    setSeller: (v) => {
      if (ctx.sellerLockedId) return;
      apply({ vendedor: v === "all" ? undefined : v });
    },
    reset: () => void navigate({ search: () => ({}) }),
    activeCount: countActive(
      filters,
      ctx.gestorLockedStoreId !== undefined,
      ctx.sellerLockedId !== undefined,
    ),
  };
}
