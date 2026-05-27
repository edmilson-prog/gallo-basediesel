import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { resolvePeriod, type RankingPeriodType } from "../utils/periods";
import type { IGamificationPeriod } from "../engine";

const VALID_PERIOD = new Set<RankingPeriodType>(["mensal", "trimestral", "anual"]);

export interface IRankingFiltersSearch {
  periodo?: string;
  loja?: string;
}

export interface IRankingFiltersState {
  period: RankingPeriodType;
  store: ID | "all";
}

export interface IUseRankingFiltersResult {
  filters: IRankingFiltersState;
  period: IGamificationPeriod;
  setPeriod: (period: RankingPeriodType) => void;
  setStore: (store: ID | "all") => void;
  reset: () => void;
  activeCount: number;
}

export const DEFAULT_RANKING_FILTERS: IRankingFiltersState = {
  period: "mensal",
  store: "all",
};

export function validateRankingSearch(raw: Record<string, unknown>): IRankingFiltersSearch {
  const out: IRankingFiltersSearch = {};
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as RankingPeriodType)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  return out;
}

export function useRankingFilters(ctx: {
  gestorLockedStoreId?: ID;
}): IUseRankingFiltersResult {
  // `strict: false` so the hook works under both the index route and the
  // drill-down — the drill page reuses the period filter but does not own it.
  const search = useSearch({ strict: false }) as IRankingFiltersSearch;
  const navigate = useNavigate();

  const filters: IRankingFiltersState = useMemo(() => {
    const period =
      (search.periodo as RankingPeriodType | undefined) ?? DEFAULT_RANKING_FILTERS.period;
    return {
      period,
      store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_RANKING_FILTERS.store,
    };
  }, [search, ctx]);

  const apply = useCallback(
    (patch: Partial<IRankingFiltersSearch>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const next: IRankingFiltersSearch = {
            ...(prev as IRankingFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IRankingFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const period = useMemo(() => resolvePeriod(filters.period), [filters.period]);

  const activeCount =
    (filters.period !== DEFAULT_RANKING_FILTERS.period ? 1 : 0) +
    (!ctx.gestorLockedStoreId && filters.store !== DEFAULT_RANKING_FILTERS.store ? 1 : 0);

  return {
    filters,
    period,
    setPeriod: (p) =>
      apply({ periodo: p === DEFAULT_RANKING_FILTERS.period ? undefined : p }),
    setStore: (v) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: v === "all" ? undefined : v });
    },
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
