import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";

export type PortfolioPeriodPreset =
  | "month_current"
  | "quarter_current"
  | "semester_current"
  | "ytd"
  | "rolling_12m"
  | "custom";

export interface IPortfolioFiltersState {
  period: PortfolioPeriodPreset;
  fromIso?: string;
  toIso?: string;
  store: ID | "all";
  seller: ID | "all";
}

export interface IPortfolioWindow {
  fromIso: string;
  toIso: string;
}

const VALID_PERIOD = new Set<PortfolioPeriodPreset>([
  "month_current",
  "quarter_current",
  "semester_current",
  "ytd",
  "rolling_12m",
  "custom",
]);

export const DEFAULT_PORTFOLIO_FILTERS: IPortfolioFiltersState = {
  period: "rolling_12m",
  store: "all",
  seller: "all",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolvePortfolioWindow(
  filters: IPortfolioFiltersState,
  now: Date = new Date(),
): IPortfolioWindow {
  if (filters.period === "custom" && filters.fromIso && filters.toIso) {
    return { fromIso: filters.fromIso, toIso: filters.toIso };
  }

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  if (filters.period === "month_current") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { fromIso: start.toISOString(), toIso: endOfToday.toISOString() };
  }

  if (filters.period === "quarter_current") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), q, 1);
    return { fromIso: start.toISOString(), toIso: endOfToday.toISOString() };
  }

  if (filters.period === "semester_current") {
    const s = now.getMonth() < 6 ? 0 : 6;
    const start = new Date(now.getFullYear(), s, 1);
    return { fromIso: start.toISOString(), toIso: endOfToday.toISOString() };
  }

  if (filters.period === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { fromIso: start.toISOString(), toIso: endOfToday.toISOString() };
  }

  // Default rolling 12 months — used to give the engine enough span to compute
  // churn / recovery transitions meaningfully on the mocked dataset.
  const rolling = new Date(now.getTime() - 365 * MS_PER_DAY);
  return { fromIso: rolling.toISOString(), toIso: endOfToday.toISOString() };
}

export interface IPortfolioFiltersSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
  vendedor?: string;
}

export function validatePortfolioSearch(raw: Record<string, unknown>): IPortfolioFiltersSearch {
  const out: IPortfolioFiltersSearch = {};
  if (
    typeof raw.periodo === "string" &&
    VALID_PERIOD.has(raw.periodo as PortfolioPeriodPreset)
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
  search: IPortfolioFiltersSearch,
  ctx: { gestorLockedStoreId?: ID; sellerLockedId?: ID },
): IPortfolioFiltersState {
  const period =
    (search.periodo as PortfolioPeriodPreset | undefined) ?? DEFAULT_PORTFOLIO_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_PORTFOLIO_FILTERS.store,
    seller: ctx.sellerLockedId ?? search.vendedor ?? DEFAULT_PORTFOLIO_FILTERS.seller,
  };
}

function countActive(
  filters: IPortfolioFiltersState,
  storeLocked: boolean,
  sellerLocked: boolean,
): number {
  let n = 0;
  if (filters.period !== DEFAULT_PORTFOLIO_FILTERS.period) n += 1;
  if (!storeLocked && filters.store !== DEFAULT_PORTFOLIO_FILTERS.store) n += 1;
  if (!sellerLocked && filters.seller !== DEFAULT_PORTFOLIO_FILTERS.seller) n += 1;
  return n;
}

export interface IUsePortfolioFiltersResult {
  filters: IPortfolioFiltersState;
  window: IPortfolioWindow;
  setPeriod: (period: PortfolioPeriodPreset, customRange?: { from: string; to: string }) => void;
  setStore: (store: ID | "all") => void;
  setSeller: (seller: ID | "all") => void;
  reset: () => void;
  activeCount: number;
}

const ROUTE_ID = "/app/gestao/carteira-analitica" as const;

/**
 * URL-synced filter state for `/app/gestao/carteira-analitica`. Mirrors the
 * pattern used by `usePositivationFilters` and `useABCFilters`.
 *
 * `ctx.gestorLockedStoreId` traps the Gestor in a single store;
 * `ctx.sellerLockedId` traps the Vendedor in their own portfolio — both setters
 * become no-ops in those cases.
 */
export function usePortfolioFilters(ctx: {
  gestorLockedStoreId?: ID;
  sellerLockedId?: ID;
}): IUsePortfolioFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IPortfolioFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<IPortfolioFiltersSearch>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const next: IPortfolioFiltersSearch = {
            ...(prev as IPortfolioFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IPortfolioFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod = useCallback<IUsePortfolioFiltersResult["setPeriod"]>(
    (period, customRange) => {
      if (period === DEFAULT_PORTFOLIO_FILTERS.period) {
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

  const window = useMemo(() => resolvePortfolioWindow(filters), [filters]);

  return {
    filters,
    window,
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
