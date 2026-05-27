import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { GoalLevel, GoalMetric, GoalPeriodType, GoalStatus, ID } from "@/shared/types";

export type GoalsTab = "active" | "history";

export interface IGoalsFiltersState {
  tab: GoalsTab;
  type: GoalMetric | "all";
  scope: GoalLevel | "all";
  status: GoalStatus | "all";
  seller: ID | "all";
  store: ID | "all";
  period: GoalPeriodType | "all";
}

export interface IGoalsFiltersSearch {
  aba?: string;
  tipo?: string;
  escopo?: string;
  status?: string;
  vendedor?: string;
  loja?: string;
  periodo?: string;
}

const VALID_TABS = new Set<GoalsTab>(["active", "history"]);
const VALID_METRICS = new Set<GoalMetric>([
  "revenue",
  "margin",
  "tickets",
  "ticket_medio",
  "novos_clientes",
  "positivacao",
  "recovery",
  "conversion",
]);
const VALID_LEVELS = new Set<GoalLevel>(["store", "individual", "team"]);
const VALID_STATUSES = new Set<GoalStatus>(["ativa", "concluida", "arquivada", "cancelada"]);
const VALID_PERIODS = new Set<GoalPeriodType>(["daily", "monthly", "quarterly"]);

export const DEFAULT_GOALS_FILTERS: IGoalsFiltersState = {
  tab: "active",
  type: "all",
  scope: "all",
  status: "all",
  seller: "all",
  store: "all",
  period: "all",
};

export function validateGoalsSearch(raw: Record<string, unknown>): IGoalsFiltersSearch {
  const out: IGoalsFiltersSearch = {};
  if (typeof raw.aba === "string" && VALID_TABS.has(raw.aba as GoalsTab)) out.aba = raw.aba;
  if (typeof raw.tipo === "string" && VALID_METRICS.has(raw.tipo as GoalMetric)) {
    out.tipo = raw.tipo;
  }
  if (typeof raw.escopo === "string" && VALID_LEVELS.has(raw.escopo as GoalLevel)) {
    out.escopo = raw.escopo;
  }
  if (typeof raw.status === "string" && VALID_STATUSES.has(raw.status as GoalStatus)) {
    out.status = raw.status;
  }
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  if (typeof raw.periodo === "string" && VALID_PERIODS.has(raw.periodo as GoalPeriodType)) {
    out.periodo = raw.periodo;
  }
  return out;
}

function readState(
  search: IGoalsFiltersSearch,
  ctx: { gestorLockedStoreId?: ID },
): IGoalsFiltersState {
  return {
    tab: (search.aba as GoalsTab | undefined) ?? DEFAULT_GOALS_FILTERS.tab,
    type: (search.tipo as GoalMetric | undefined) ?? DEFAULT_GOALS_FILTERS.type,
    scope: (search.escopo as GoalLevel | undefined) ?? DEFAULT_GOALS_FILTERS.scope,
    status: (search.status as GoalStatus | undefined) ?? DEFAULT_GOALS_FILTERS.status,
    seller: search.vendedor ?? DEFAULT_GOALS_FILTERS.seller,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_GOALS_FILTERS.store,
    period: (search.periodo as GoalPeriodType | undefined) ?? DEFAULT_GOALS_FILTERS.period,
  };
}

function countActive(filters: IGoalsFiltersState, storeLocked: boolean): number {
  let n = 0;
  if (filters.type !== "all") n += 1;
  if (filters.scope !== "all") n += 1;
  if (filters.status !== "all") n += 1;
  if (filters.seller !== "all") n += 1;
  if (!storeLocked && filters.store !== "all") n += 1;
  if (filters.period !== "all") n += 1;
  return n;
}

export interface IUseGoalsFiltersResult {
  filters: IGoalsFiltersState;
  setTab: (tab: GoalsTab) => void;
  setType: (type: GoalMetric | "all") => void;
  setScope: (scope: GoalLevel | "all") => void;
  setStatus: (status: GoalStatus | "all") => void;
  setSeller: (seller: ID | "all") => void;
  setStore: (store: ID | "all") => void;
  setPeriod: (period: GoalPeriodType | "all") => void;
  reset: () => void;
  activeCount: number;
}

const ROUTE_ID = "/app/gestao/metas" as const;

/**
 * URL-synced filter state for `/app/gestao/metas`. Mirrors the patterns from
 * the manager/SDR/sales dashboards. The Gestor variant locks the store filter.
 */
export function useGoalsFilters(ctx: { gestorLockedStoreId?: ID }): IUseGoalsFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IGoalsFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<IGoalsFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IGoalsFiltersSearch = {
            ...(prev as IGoalsFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IGoalsFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  return {
    filters,
    setTab: (tab) => apply({ aba: tab === "active" ? undefined : tab }),
    setType: (type) => apply({ tipo: type === "all" ? undefined : type }),
    setScope: (scope) => apply({ escopo: scope === "all" ? undefined : scope }),
    setStatus: (status) => apply({ status: status === "all" ? undefined : status }),
    setSeller: (seller) => apply({ vendedor: seller === "all" ? undefined : seller }),
    setStore: (store) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: store === "all" ? undefined : store });
    },
    setPeriod: (period) => apply({ periodo: period === "all" ? undefined : period }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount: countActive(filters, ctx.gestorLockedStoreId !== undefined),
  };
}
