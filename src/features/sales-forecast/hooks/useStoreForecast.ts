import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useOrdersProvider, useLeadsProvider, useSellersProvider } from "@/providers/data";
import { useGoalsWithProgress } from "@/features/goals";
import { sumBy } from "@/features/sales-analytics/utils/aggregations";
import type { ID } from "@/shared/types/common";
import type { GoalLevel, IGoalPeriod } from "@/shared/types/bi";
import type { ForecastMetric, IForecast, IForecastConfig } from "@/shared/types/forecast";
import type { ILead } from "@/shared/types/lead";
import type { IOrder } from "@/shared/types/commercial";
import type { ISeller } from "@/shared/types/people";

import { buildForecastInput } from "../engine/buildForecastInput";
import { computeForecast } from "../engine/computeForecast";
import { DEFAULT_FORECAST_CONFIG } from "../engine/defaults";

export interface ISellerForecast {
  sellerId: ID;
  sellerName: string;
  forecast: IForecast;
}

export interface IUseStoreForecastResult {
  storeForecast: IForecast | null;
  bySeller: ISellerForecast[];
  isLoading: boolean;
  hasError: boolean;
}

export interface IUseStoreForecastParams {
  storeId: ID;
  metric: ForecastMetric;
  config?: IForecastConfig;
}

/** Calendar-month bounds as ISO strings (local time), no @/mocks dependency. */
function monthBounds(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

const STALE_MS = 30_000;

/** `provavel` scenario gap (target - projected); larger gap means a seller pulling the store down. */
function provavelGap(forecast: IForecast): number {
  const scenario = forecast.scenarios.find((s) => s.type === "provavel");
  return scenario?.gapToTarget ?? 0;
}

/**
 * Store-level closing forecast plus a per-seller breakdown, fetched once (PRD-056).
 *
 * Orders, leads and sellers are loaded a single time and the engine is run for
 * the whole store and for each active seller, so the cockpit and the forecast
 * page can render the aggregate alongside the ranking without N+1 fetches.
 */
export function useStoreForecast(params: IUseStoreForecastParams): IUseStoreForecastResult {
  const { storeId, metric, config } = params;

  const now = useMemo(() => new Date(), []);
  const bounds = useMemo(() => monthBounds(now), [now]);
  const period = useMemo<IGoalPeriod>(
    () => ({ type: "monthly", start: bounds.start, end: bounds.end }),
    [bounds],
  );

  const ordersProvider = useOrdersProvider();
  const leadsProvider = useLeadsProvider();
  const sellersProvider = useSellersProvider();

  const ordersQuery = useQuery({
    queryKey: ["store-forecast", "orders", storeId, bounds.start],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        paymentStatus: "pago",
        since: bounds.start,
        until: bounds.end,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const leadsQuery = useQuery({
    queryKey: ["store-forecast", "leads", storeId],
    queryFn: () => leadsProvider.list({ storeId, pageSize: 2000 }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["store-forecast", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
  });

  const goals = useGoalsWithProgress({ storeId, statuses: ["ativa"] });

  const isLoading =
    ordersQuery.isLoading || leadsQuery.isLoading || sellersQuery.isLoading || goals.isLoading;
  const hasError =
    ordersQuery.isError || leadsQuery.isError || sellersQuery.isError || goals.hasError;

  const result = useMemo<{ storeForecast: IForecast | null; bySeller: ISellerForecast[] }>(() => {
    if (isLoading || hasError) {
      return { storeForecast: null, bySeller: [] };
    }

    const allOrders: IOrder[] = ordersQuery.data?.data ?? [];
    const allLeads: ILead[] = leadsQuery.data?.data ?? [];
    // sellersProvider.list returns a plain array; stay defensive against a paginated shape.
    const sellersData = sellersQuery.data;
    const sellers: ISeller[] = Array.isArray(sellersData)
      ? sellersData
      : ((sellersData as { data?: ISeller[] } | undefined)?.data ?? []);

    const nowMs = now.getTime();

    const findTarget = (level: GoalLevel, targetId: ID): { value: number } | undefined => {
      const matching = goals.items.find(
        (it) =>
          it.goal.level === level &&
          it.goal.targetId === targetId &&
          it.goal.metric === metric &&
          new Date(it.goal.period.start).getTime() <= nowMs &&
          new Date(it.goal.period.end).getTime() >= nowMs,
      );
      return matching ? { value: matching.goal.targetValue } : undefined;
    };

    const compute = (scopeSellerId?: ID): IForecast => {
      const orders = scopeSellerId
        ? allOrders.filter((o) => o.sellerId === scopeSellerId)
        : allOrders;
      const leads = scopeSellerId ? allLeads.filter((l) => l.sellerId === scopeSellerId) : allLeads;

      const ordersTotal = sumBy(orders, (o) => o.total);
      const realizedValue = metric === "revenue" ? ordersTotal : orders.length;
      const avgTicket = orders.length ? ordersTotal / orders.length : undefined;

      const level: GoalLevel = scopeSellerId ? "individual" : "store";
      const target = findTarget(level, scopeSellerId ?? storeId);

      const input = buildForecastInput({
        scope: { level, targetId: scopeSellerId ?? storeId, storeId, sellerId: scopeSellerId },
        metric,
        period,
        realizedValue,
        avgTicket,
        leads,
        target,
        now,
      });

      return computeForecast(input, config ?? DEFAULT_FORECAST_CONFIG);
    };

    const storeForecast = compute();

    const bySeller: ISellerForecast[] = sellers
      .filter((s) => {
        const hasOrders = allOrders.some((o) => o.sellerId === s.id);
        const hasLeads = allLeads.some((l) => l.sellerId === s.id);
        return hasOrders || hasLeads;
      })
      .map((s) => ({
        sellerId: s.id,
        sellerName: s.fullName,
        forecast: compute(s.id),
      }))
      // Sellers pulling the gap down (largest positive gap of the provável scenario) first.
      .sort((a, b) => provavelGap(b.forecast) - provavelGap(a.forecast));

    return { storeForecast, bySeller };
  }, [
    isLoading,
    hasError,
    ordersQuery.data,
    leadsQuery.data,
    sellersQuery.data,
    goals.items,
    metric,
    storeId,
    period,
    now,
    config,
  ]);

  return {
    storeForecast: result.storeForecast,
    bySeller: result.bySeller,
    isLoading,
    hasError,
  };
}
