import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useSalesAnalytics, type ISalesFiltersState } from "@/features/sales-analytics";
import { useGoalsWithProgress } from "@/features/goals";
import { FETCH_ALL_PAGE_SIZE, useLeadsProvider } from "@/providers/data";
import type { GoalLevel, IGoalPeriod } from "@/shared/types/bi";
import type { ID } from "@/shared/types/common";
import type { ForecastMetric, IForecast, IForecastConfig } from "@/shared/types/forecast";

import { buildForecastInput } from "../engine/buildForecastInput";
import { computeForecast } from "../engine/computeForecast";
import { DEFAULT_FORECAST_CONFIG } from "../engine/defaults";

export interface IUseForecastFilters {
  storeId: ID;
  sellerId?: ID;
  metric: ForecastMetric;
  config?: IForecastConfig;
}

export interface IUseForecastResult {
  forecast: IForecast | null;
  isLoading: boolean;
  hasError: boolean;
}

/** Calendar-month bounds as ISO strings (local time), no @/mocks dependency. */
function monthBounds(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Derives the closing forecast in runtime from existing BI providers (PRD-056, RF-015).
 * Aggregates inputs (not a sum of per-seller forecasts) and memoizes the result.
 */
export function useForecast(filters: IUseForecastFilters): IUseForecastResult {
  const { storeId, sellerId, metric, config = DEFAULT_FORECAST_CONFIG } = filters;

  const now = useMemo(() => new Date(), []);

  const windows = useMemo(() => {
    const cur = monthBounds(now);
    const prev = monthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const period: IGoalPeriod = { type: "monthly", start: cur.start, end: cur.end };
    return {
      current: { fromIso: cur.start, toIso: cur.end },
      previous: { fromIso: prev.start, toIso: prev.end },
      period,
    };
  }, [now]);

  const salesFilters: ISalesFiltersState = useMemo(
    () => ({
      period: "custom",
      fromIso: windows.current.fromIso,
      toIso: windows.current.toIso,
      store: "all",
      seller: "all",
      category: "all",
      vehicleBrand: "all",
      channel: "all",
    }),
    [windows],
  );

  const sales = useSalesAnalytics({
    filters: salesFilters,
    window: windows.current,
    previousWindow: windows.previous,
    scope: { storeId, sellerId },
  });

  const goals = useGoalsWithProgress({ storeId, sellerId, statuses: ["ativa"] });

  const leadsProvider = useLeadsProvider();
  const leadsQuery = useQuery({
    queryKey: ["forecast", "leads", storeId, sellerId ?? "all"],
    queryFn: () => leadsProvider.list({ storeId, sellerId, pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: 30_000,
  });

  const isLoading = sales.isLoading || goals.isLoading || leadsQuery.isLoading;
  const hasError = sales.hasError || goals.hasError || leadsQuery.isError;

  const forecast = useMemo<IForecast | null>(() => {
    if (isLoading || hasError) return null;

    const realizedValue =
      metric === "revenue" ? sales.kpis.revenue.current : sales.kpis.orderCount.current;
    const avgTicket = sales.kpis.avgTicket.current;

    const nowMs = now.getTime();
    const matching = goals.items.find(
      (it) =>
        it.goal.metric === metric &&
        new Date(it.goal.period.start).getTime() <= nowMs &&
        new Date(it.goal.period.end).getTime() >= nowMs,
    );
    const target = matching ? { value: matching.goal.targetValue } : undefined;

    const leads = leadsQuery.data?.data ?? [];
    const level: GoalLevel = sellerId ? "individual" : "store";

    const input = buildForecastInput({
      scope: { level, targetId: sellerId ?? storeId, storeId, sellerId },
      metric,
      period: windows.period,
      realizedValue,
      avgTicket,
      leads,
      target,
      now,
    });

    return computeForecast(input, config);
  }, [
    isLoading,
    hasError,
    metric,
    sales,
    goals.items,
    leadsQuery.data,
    storeId,
    sellerId,
    windows,
    now,
    config,
  ]);

  return { forecast, isLoading, hasError };
}
