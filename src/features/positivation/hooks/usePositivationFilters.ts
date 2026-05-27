import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";

export type PositivationPeriodPreset =
  | "month_current"
  | "month_previous"
  | "quarter_current"
  | "ytd"
  | "custom";

export interface IPositivationFiltersState {
  period: PositivationPeriodPreset;
  /** Only set when period === "custom". */
  fromIso?: string;
  /** Only set when period === "custom". */
  toIso?: string;
  store: ID | "all";
  seller: ID | "all";
}

export interface IPositivationWindow {
  fromIso: string;
  toIso: string;
}

const VALID_PERIOD = new Set<PositivationPeriodPreset>([
  "month_current",
  "month_previous",
  "quarter_current",
  "ytd",
  "custom",
]);

export const DEFAULT_POSITIVATION_FILTERS: IPositivationFiltersState = {
  period: "month_current",
  store: "all",
  seller: "all",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolvePositivationWindow(
  filters: IPositivationFiltersState,
  scope: "current" | "previous",
  now: Date = new Date(),
): IPositivationWindow {
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

  if (filters.period === "month_current") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (scope === "current") {
      return {
        fromIso: start.toISOString(),
        toIso: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
      };
    }
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
  }

  if (filters.period === "month_previous") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    if (scope === "current") return { fromIso: start.toISOString(), toIso: end.toISOString() };
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = new Date(start.getTime() - 1);
    return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
  }

  if (filters.period === "quarter_current") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    if (scope === "current") {
      return {
        fromIso: start.toISOString(),
        toIso: new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59).toISOString(),
      };
    }
    const prevStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
    const prevEnd = new Date(start.getTime() - 1);
    return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
  }

  // ytd
  const start = new Date(now.getFullYear(), 0, 1);
  if (scope === "current") {
    return { fromIso: start.toISOString(), toIso: now.toISOString() };
  }
  const prevStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevEnd = new Date(start.getTime() - 1);
  return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
}

/**
 * Number of days elapsed since the start of the current period — used by the
 * evolution chart and by the linear projection.
 */
export function daysElapsedInWindow(window: IPositivationWindow, now: Date = new Date()): number {
  const start = new Date(window.fromIso).getTime();
  return Math.max(1, Math.ceil((now.getTime() - start) / MS_PER_DAY));
}

export function totalDaysInWindow(window: IPositivationWindow): number {
  const start = new Date(window.fromIso).getTime();
  const end = new Date(window.toIso).getTime();
  return Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
}

export interface IPositivationFiltersSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
  vendedor?: string;
}

export function validatePositivationSearch(
  raw: Record<string, unknown>,
): IPositivationFiltersSearch {
  const out: IPositivationFiltersSearch = {};
  if (
    typeof raw.periodo === "string" &&
    VALID_PERIOD.has(raw.periodo as PositivationPeriodPreset)
  ) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.de === "string" && raw.de.length > 0) out.de = raw.de;
  if (typeof raw.ate === "string" && raw.ate.length > 0) out.ate = raw.ate;
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  return out;
}

function readState(
  search: IPositivationFiltersSearch,
  ctx: { gestorLockedStoreId?: ID; sellerLockedId?: ID },
): IPositivationFiltersState {
  const period =
    (search.periodo as PositivationPeriodPreset | undefined) ?? DEFAULT_POSITIVATION_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_POSITIVATION_FILTERS.store,
    seller: ctx.sellerLockedId ?? search.vendedor ?? DEFAULT_POSITIVATION_FILTERS.seller,
  };
}

function countActive(
  filters: IPositivationFiltersState,
  storeLocked: boolean,
  sellerLocked: boolean,
): number {
  let n = 0;
  if (filters.period !== DEFAULT_POSITIVATION_FILTERS.period) n += 1;
  if (!storeLocked && filters.store !== DEFAULT_POSITIVATION_FILTERS.store) n += 1;
  if (!sellerLocked && filters.seller !== DEFAULT_POSITIVATION_FILTERS.seller) n += 1;
  return n;
}

export interface IUsePositivationFiltersResult {
  filters: IPositivationFiltersState;
  window: IPositivationWindow;
  previousWindow: IPositivationWindow;
  setPeriod: (period: PositivationPeriodPreset, customRange?: { from: string; to: string }) => void;
  setStore: (store: ID | "all") => void;
  setSeller: (seller: ID | "all") => void;
  reset: () => void;
  activeCount: number;
}

const ROUTE_ID = "/app/gestao/positivacao" as const;

/**
 * URL-synced filter state for `/app/gestao/positivacao`. Mirrors the pattern
 * used by `useSalesFilters` / `useCockpitFilters`. `ctx.gestorLockedStoreId`
 * traps the Gestor in a single store; `ctx.sellerLockedId` traps the Vendedor
 * in their own portfolio — both setters become no-ops in those cases.
 */
export function usePositivationFilters(ctx: {
  gestorLockedStoreId?: ID;
  sellerLockedId?: ID;
}): IUsePositivationFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IPositivationFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<IPositivationFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IPositivationFiltersSearch = {
            ...(prev as IPositivationFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IPositivationFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod = useCallback<IUsePositivationFiltersResult["setPeriod"]>(
    (period, customRange) => {
      if (period === DEFAULT_POSITIVATION_FILTERS.period) {
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

  const window = useMemo(() => resolvePositivationWindow(filters, "current"), [filters]);
  const previousWindow = useMemo(() => resolvePositivationWindow(filters, "previous"), [filters]);

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
