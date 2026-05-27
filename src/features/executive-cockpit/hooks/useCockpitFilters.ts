import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";

/** Preset windows supported by the cockpit. Strategic views — no daily/weekly buckets. */
export type CockpitPeriodPreset = "month" | "quarter" | "ytd" | "custom";

/** Comparison baseline for KPI trends. */
export type CockpitCompareBase = "previous" | "yoy";

export interface ICockpitFiltersState {
  period: CockpitPeriodPreset;
  /** Only set when period === "custom". */
  fromIso?: string;
  /** Only set when period === "custom". */
  toIso?: string;
  store: ID | "all";
  compare: CockpitCompareBase;
}

export interface ICockpitWindow {
  fromIso: string;
  toIso: string;
}

const VALID_PERIOD = new Set<CockpitPeriodPreset>(["month", "quarter", "ytd", "custom"]);
const VALID_COMPARE = new Set<CockpitCompareBase>(["previous", "yoy"]);

export const DEFAULT_COCKPIT_FILTERS: ICockpitFiltersState = {
  period: "month",
  store: "all",
  compare: "previous",
};

/** Window helpers — produce ISO bounds for `current`, `previous` and `yoy` ranges. */
export function resolveCockpitWindow(
  filters: ICockpitFiltersState,
  scope: "current" | "previous" | "yoy",
  now: Date = new Date(),
): ICockpitWindow {
  if (filters.period === "custom" && filters.fromIso && filters.toIso) {
    const from = new Date(filters.fromIso).getTime();
    const to = new Date(filters.toIso).getTime();
    const span = Math.max(0, to - from);
    if (scope === "current") {
      return { fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() };
    }
    if (scope === "yoy") {
      const yearMs = 365 * 24 * 3600_000;
      return {
        fromIso: new Date(from - yearMs).toISOString(),
        toIso: new Date(to - yearMs).toISOString(),
      };
    }
    return {
      fromIso: new Date(from - span - 1).toISOString(),
      toIso: new Date(from - 1).toISOString(),
    };
  }

  if (filters.period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
    if (scope === "yoy") {
      const yStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      const yEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59);
      return { fromIso: yStart.toISOString(), toIso: yEnd.toISOString() };
    }
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
  }

  if (filters.period === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
    if (scope === "yoy") {
      const yStart = new Date(now.getFullYear() - 1, qStartMonth, 1);
      const yEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59);
      return { fromIso: yStart.toISOString(), toIso: yEnd.toISOString() };
    }
    const prevStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
    const prevEnd = new Date(now.getFullYear(), qStartMonth, 0, 23, 59, 59);
    return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
  }

  // ytd
  const start = new Date(now.getFullYear(), 0, 1);
  if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
  if (scope === "yoy") {
    const yStart = new Date(now.getFullYear() - 1, 0, 1);
    const yEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59);
    return { fromIso: yStart.toISOString(), toIso: yEnd.toISOString() };
  }
  const prevStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevEnd = new Date(start.getTime() - 1);
  return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
}

export interface ICockpitFiltersSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
  comparar?: string;
}

export function validateCockpitSearch(raw: Record<string, unknown>): ICockpitFiltersSearch {
  const out: ICockpitFiltersSearch = {};
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as CockpitPeriodPreset)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.de === "string" && raw.de.length > 0) out.de = raw.de;
  if (typeof raw.ate === "string" && raw.ate.length > 0) out.ate = raw.ate;
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  if (typeof raw.comparar === "string" && VALID_COMPARE.has(raw.comparar as CockpitCompareBase)) {
    out.comparar = raw.comparar;
  }
  return out;
}

function readState(
  search: ICockpitFiltersSearch,
  ctx: { gestorLockedStoreId?: ID },
): ICockpitFiltersState {
  const period =
    (search.periodo as CockpitPeriodPreset | undefined) ?? DEFAULT_COCKPIT_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_COCKPIT_FILTERS.store,
    compare: (search.comparar as CockpitCompareBase | undefined) ?? DEFAULT_COCKPIT_FILTERS.compare,
  };
}

function countActive(filters: ICockpitFiltersState, storeLocked: boolean): number {
  let n = 0;
  if (filters.period !== DEFAULT_COCKPIT_FILTERS.period) n += 1;
  if (!storeLocked && filters.store !== DEFAULT_COCKPIT_FILTERS.store) n += 1;
  if (filters.compare !== DEFAULT_COCKPIT_FILTERS.compare) n += 1;
  return n;
}

export interface IUseCockpitFiltersResult {
  filters: ICockpitFiltersState;
  window: ICockpitWindow;
  previousWindow: ICockpitWindow;
  setPeriod: (period: CockpitPeriodPreset, customRange?: { from: string; to: string }) => void;
  setStore: (store: ID | "all") => void;
  setCompare: (compare: CockpitCompareBase) => void;
  reset: () => void;
  activeCount: number;
}

const ROUTE_ID = "/app/gestao/" as const;

/**
 * URL-synced filter state for `/app/gestao` (cockpit). Mirrors the pattern used
 * by `useSalesFilters` (PRD-041). `ctx.gestorLockedStoreId` traps the Gestor in
 * a single store — the setter becomes a no-op in that case.
 */
export function useCockpitFilters(ctx: { gestorLockedStoreId?: ID }): IUseCockpitFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as ICockpitFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<ICockpitFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: ICockpitFiltersSearch = {
            ...(prev as ICockpitFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof ICockpitFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod = useCallback<IUseCockpitFiltersResult["setPeriod"]>(
    (period, customRange) => {
      if (period === DEFAULT_COCKPIT_FILTERS.period) {
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

  const window = useMemo(() => resolveCockpitWindow(filters, "current"), [filters]);
  const previousWindow = useMemo(
    () => resolveCockpitWindow(filters, filters.compare === "yoy" ? "yoy" : "previous"),
    [filters],
  );

  return {
    filters,
    window,
    previousWindow,
    setPeriod,
    setStore: (v) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: v === "all" ? undefined : v });
    },
    setCompare: (v) => apply({ comparar: v === DEFAULT_COCKPIT_FILTERS.compare ? undefined : v }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount: countActive(filters, ctx.gestorLockedStoreId !== undefined),
  };
}
