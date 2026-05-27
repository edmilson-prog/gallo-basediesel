import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { currentPeriod } from "../utils/periods";

const PERIOD_REGEX = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export interface ICommissionsFiltersSearch {
  periodo?: string;
  vendedor?: string;
}

export interface ICommissionsFiltersState {
  period: string;
  sellerId: ID | "all";
}

export interface IUseCommissionsFiltersResult {
  filters: ICommissionsFiltersState;
  setPeriod: (period: string) => void;
  setSeller: (seller: ID | "all") => void;
  reset: () => void;
  activeCount: number;
}

export function validateCommissionsSearch(raw: Record<string, unknown>): ICommissionsFiltersSearch {
  const out: ICommissionsFiltersSearch = {};
  if (typeof raw.periodo === "string" && PERIOD_REGEX.test(raw.periodo)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) {
    out.vendedor = raw.vendedor;
  }
  return out;
}

export const DEFAULT_COMMISSIONS_FILTERS = (): ICommissionsFiltersState => ({
  period: currentPeriod(),
  sellerId: "all",
});

/**
 * URL-synced filters for the commissions page (PRD-047). Used by both the
 * consolidated list and the drill-down — `strict: false` keeps the hook
 * functional under nested routes.
 */
export function useCommissionsFilters(opts: { sellerLockedId?: ID }): IUseCommissionsFiltersResult {
  const search = useSearch({ strict: false }) as ICommissionsFiltersSearch;
  const navigate = useNavigate();

  const filters: ICommissionsFiltersState = useMemo(() => {
    const period = search.periodo ?? currentPeriod();
    return {
      period,
      sellerId: opts.sellerLockedId ?? search.vendedor ?? "all",
    };
  }, [search, opts.sellerLockedId]);

  const apply = useCallback(
    (patch: Partial<ICommissionsFiltersSearch>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const next: ICommissionsFiltersSearch = {
            ...(prev as ICommissionsFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof ICommissionsFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const defaults = DEFAULT_COMMISSIONS_FILTERS();
  const activeCount =
    (filters.period !== defaults.period ? 1 : 0) +
    (!opts.sellerLockedId && filters.sellerId !== "all" ? 1 : 0);

  return {
    filters,
    setPeriod: (p) => apply({ periodo: p === defaults.period ? undefined : p }),
    setSeller: (s) => {
      if (opts.sellerLockedId) return;
      apply({ vendedor: s === "all" ? undefined : s });
    },
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
