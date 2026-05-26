import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";

export type SdrPeriodPreset = "today" | "7d" | "30d" | "custom";

export interface ISdrDashboardFiltersState {
  period: SdrPeriodPreset;
  fromIso?: string;
  toIso?: string;
  store: ID | "all";
}

export interface ISdrDashboardWindow {
  fromIso: string;
  toIso: string;
}

const VALID_PERIOD = new Set<SdrPeriodPreset>(["today", "7d", "30d", "custom"]);

export const DEFAULT_SDR_FILTERS: ISdrDashboardFiltersState = {
  period: "30d",
  store: "all",
};

function resolveWindow(
  filters: ISdrDashboardFiltersState,
  scope: "current" | "previous",
  now: Date = new Date(),
): ISdrDashboardWindow {
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

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  switch (filters.period) {
    case "today": {
      if (scope === "current") {
        return { fromIso: todayStart.toISOString(), toIso: now.toISOString() };
      }
      const prevStart = new Date(todayStart.getTime() - 24 * 3600_000);
      const prevEnd = new Date(todayStart.getTime() - 1);
      return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
    }
    case "7d": {
      const start = new Date(now.getTime() - 7 * 24 * 3600_000);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 7 * 24 * 3600_000);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
    case "30d":
    default: {
      const start = new Date(now.getTime() - 30 * 24 * 3600_000);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 30 * 24 * 3600_000);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
  }
}

interface ISearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
}

function readState(
  search: ISearch,
  ctx: { gestorLockedStoreId?: ID },
): ISdrDashboardFiltersState {
  const period =
    typeof search.periodo === "string" && VALID_PERIOD.has(search.periodo as SdrPeriodPreset)
      ? (search.periodo as SdrPeriodPreset)
      : DEFAULT_SDR_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_SDR_FILTERS.store,
  };
}

export interface IUseSdrDashboardFilters {
  filters: ISdrDashboardFiltersState;
  window: ISdrDashboardWindow;
  previousWindow: ISdrDashboardWindow;
  setPeriod: (period: SdrPeriodPreset, customRange?: { from: string; to: string }) => void;
  setStore: (store: ID | "all") => void;
  reset: () => void;
}

/**
 * URL-synced filter state for the SDR painel (PRD-024 RF-033/034). Mirrors the
 * pattern used by the manager dashboard but only the period + store are
 * surfaced — vendor and channel don't apply to SDR sessions on the MVP.
 */
export function useSdrDashboardFilters(ctx: {
  gestorLockedStoreId?: ID;
}): IUseSdrDashboardFilters {
  const search = useSearch({ from: "/app/sdr" }) as ISearch;
  const navigate = useNavigate({ from: "/app/sdr" });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<ISearch>) => {
      void navigate({
        search: (prev) => {
          const next: ISearch = { ...(prev as ISearch), ...patch };
          for (const key of Object.keys(next) as (keyof ISearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod: IUseSdrDashboardFilters["setPeriod"] = useCallback(
    (period, customRange) => {
      if (period === DEFAULT_SDR_FILTERS.period) {
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

  const window = useMemo(() => resolveWindow(filters, "current"), [filters]);
  const previousWindow = useMemo(() => resolveWindow(filters, "previous"), [filters]);

  return {
    filters,
    window,
    previousWindow,
    setPeriod,
    setStore: (v) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: v === "all" ? undefined : v });
    },
    reset: () => void navigate({ search: () => ({}) }),
  };
}
