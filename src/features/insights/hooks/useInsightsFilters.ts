import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { InsightCategory, InsightPriority } from "@/shared/types";

const VALID_CATEGORY = new Set<InsightCategory>([
  "financeiro",
  "comercial",
  "operacional",
  "cliente",
]);
const VALID_PRIORITY = new Set<InsightPriority>(["critico", "medio", "oportunidade", "info"]);
const VALID_STATUS = new Set<InsightTab>(["ativos", "dispensados"]);
const VALID_PERIOD = new Set<InsightPeriod>(["7d", "30d", "90d", "all"]);

export type InsightTab = "ativos" | "dispensados";
export type InsightPeriod = "7d" | "30d" | "90d" | "all";

export interface IInsightsSearch {
  categoria?: string;
  prioridade?: string;
  periodo?: string;
  status?: string;
}

export function validateInsightsSearch(raw: Record<string, unknown>): IInsightsSearch {
  const out: IInsightsSearch = {};
  if (typeof raw.categoria === "string" && VALID_CATEGORY.has(raw.categoria as InsightCategory)) {
    out.categoria = raw.categoria;
  }
  if (typeof raw.prioridade === "string" && VALID_PRIORITY.has(raw.prioridade as InsightPriority)) {
    out.prioridade = raw.prioridade;
  }
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as InsightPeriod)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.status === "string" && VALID_STATUS.has(raw.status as InsightTab)) {
    out.status = raw.status;
  }
  return out;
}

export interface IInsightsFiltersState {
  category: InsightCategory | "all";
  priority: InsightPriority | "all";
  period: InsightPeriod;
  status: InsightTab;
}

const ROUTE_ID = "/app/insights" as const;

export interface IUseInsightsFiltersResult {
  state: IInsightsFiltersState;
  setCategory: (c: InsightCategory | "all") => void;
  setPriority: (p: InsightPriority | "all") => void;
  setPeriod: (p: InsightPeriod) => void;
  setStatus: (s: InsightTab) => void;
  reset: () => void;
  activeCount: number;
}

export function useInsightsFilters(): IUseInsightsFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IInsightsSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<IInsightsFiltersState>(
    () => ({
      category: (search.categoria as InsightCategory | undefined) ?? "all",
      priority: (search.prioridade as InsightPriority | undefined) ?? "all",
      period: (search.periodo as InsightPeriod | undefined) ?? "all",
      status: (search.status as InsightTab | undefined) ?? "ativos",
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<IInsightsSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IInsightsSearch = { ...(prev as IInsightsSearch), ...patch };
          for (const key of Object.keys(next) as (keyof IInsightsSearch)[]) {
            const v = next[key];
            if (v === undefined || v === "" || v === "all") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  let activeCount = 0;
  if (state.category !== "all") activeCount += 1;
  if (state.priority !== "all") activeCount += 1;
  if (state.period !== "all") activeCount += 1;

  return {
    state,
    setCategory: (c) => apply({ categoria: c === "all" ? undefined : c }),
    setPriority: (p) => apply({ prioridade: p === "all" ? undefined : p }),
    setPeriod: (p) => apply({ periodo: p === "all" ? undefined : p }),
    setStatus: (s) => apply({ status: s === "ativos" ? undefined : s }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
