import { useMemo } from "react";

import {
  useCustomersProvider,
  useLeadsProvider,
  useOrdersProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { classifyABC } from "@/features/abc-curve/engine/classifyABC";
import { calculatePortfolioMetrics } from "@/features/portfolio-analytics/engine/calculatePortfolioMetrics";
import { calculatePositivation } from "@/features/positivation/engine/calculatePositivation";
import { sumBy } from "@/features/sales-analytics/utils/aggregations";
import {
  buildForecastInput,
  computeForecast,
  DEFAULT_FORECAST_CONFIG,
} from "@/features/sales-forecast";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { IOrder } from "@/shared/types";
import type {
  IAnalyticsDataAccess,
  IMetricQuery,
  IMetricQueryScope,
} from "@/shared/types/analytics-copilot";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

/** Previous calendar month bounds derived from the current period start (RNF-001 stays data-driven). */
function prevPeriod(period: IGoalPeriod): IGoalPeriod {
  const start = new Date(period.start);
  const prevStart = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1, 0, 0, 0, 0),
  );
  const prevEnd = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0, 23, 59, 59, 999),
  );
  return { type: period.type, start: prevStart.toISOString(), end: prevEnd.toISOString() };
}

/**
 * Concrete {@link IAnalyticsDataAccess} wired from the data providers and the
 * existing pure BI engines. Orchestration lives in the feature (not the data
 * layer) to avoid a providers → features dependency inversion.
 *
 * RNF-001: every returned `value` is computed from provider data + pure
 * functions — the resolver never produces a number.
 */
export function useAnalyticsDataAccess(): IAnalyticsDataAccess {
  const ordersProvider = useOrdersProvider();
  const leadsProvider = useLeadsProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const settingsProvider = useSettingsProvider();

  return useMemo<IAnalyticsDataAccess>(() => {
    const loadOrders = async (
      scope: IMetricQueryScope | undefined,
      period: IGoalPeriod,
      sellerId?: string,
    ): Promise<IOrder[]> => {
      const result = await ordersProvider.list({
        storeId: scope?.storeId,
        sellerId: sellerId ?? scope?.sellerId,
        paymentStatus: "pago",
        since: period.start,
        until: period.end,
        pageSize: 3000,
      });
      return result.data ?? [];
    };

    const loadCustomers = async (scope: IMetricQueryScope | undefined) => {
      const result = await customersProvider.list({
        storeId: scope?.storeId,
        sellerIds: scope?.sellerId ? [scope.sellerId] : undefined,
        pageSize: 3000,
      });
      return result.data ?? [];
    };

    const loadSellers = (scope: IMetricQueryScope | undefined) =>
      sellersProvider.list({ storeId: scope?.storeId, active: true });

    const loadSettings = (scope: IMetricQueryScope | undefined) =>
      settingsProvider.get(scope?.storeId ?? DEFAULT_STORE_ID);

    const salesValue = (metricId: string, orders: IOrder[]): number => {
      if (metricId === "pedidos") return orders.length;
      if (metricId === "ticket_medio") {
        return orders.length ? sumBy(orders, (o) => o.total) / orders.length : 0;
      }
      // faturamento (default)
      return sumBy(orders, (o) => o.total);
    };

    return {
      async getSalesMetric(query: IMetricQuery) {
        const orders = await loadOrders(query.scope, query.period);
        const value = salesValue(query.metricId, orders);
        if (!query.comparison) return { value };
        const prevOrders = await loadOrders(query.scope, prevPeriod(query.period));
        return { value, previousValue: salesValue(query.metricId, prevOrders) };
      },

      async getMargin(query: IMetricQuery) {
        const orders = await loadOrders(query.scope, query.period);
        const value = sumBy(
          orders.flatMap((o) => o.items ?? []),
          (it) => it.marginValue ?? 0,
        );
        if (!query.comparison) return { value };
        const prevOrders = await loadOrders(query.scope, prevPeriod(query.period));
        const previousValue = sumBy(
          prevOrders.flatMap((o) => o.items ?? []),
          (it) => it.marginValue ?? 0,
        );
        return { value, previousValue };
      },

      async getPositivation(query: IMetricQuery) {
        const [customers, orders, sellers, settings] = await Promise.all([
          loadCustomers(query.scope),
          loadOrders(query.scope, query.period),
          loadSellers(query.scope),
          loadSettings(query.scope),
        ]);
        const metrics = calculatePositivation(query.period.start, query.period.end, {
          customers,
          ordersInPeriod: orders,
          sellers,
          dormantDays: settings.lifecycleThresholds.dormantDays,
        });
        if (!query.comparison) return { value: metrics.positivationRate };
        const prev = prevPeriod(query.period);
        const prevOrders = await loadOrders(query.scope, prev);
        const prevMetrics = calculatePositivation(prev.start, prev.end, {
          customers,
          ordersInPeriod: prevOrders,
          sellers,
          dormantDays: settings.lifecycleThresholds.dormantDays,
        });
        return { value: metrics.positivationRate, previousValue: prevMetrics.positivationRate };
      },

      async getABCClass(query: IMetricQuery) {
        const [customers, orders, settings] = await Promise.all([
          loadCustomers(query.scope),
          loadOrders(query.scope, query.period),
          loadSettings(query.scope),
        ]);
        const metrics = classifyABC(query.period.start, query.period.end, {
          customers,
          ordersInPeriod: orders,
          settings: settings.abcCurveSettings,
        });
        return { value: metrics.totalRevenue };
      },

      async getPortfolioStatus(query: IMetricQuery) {
        const [customers, orders, sellers, settings] = await Promise.all([
          loadCustomers(query.scope),
          loadOrders(query.scope, query.period),
          loadSellers(query.scope),
          loadSettings(query.scope),
        ]);
        const metrics = calculatePortfolioMetrics(query.period.start, query.period.end, {
          customers,
          ordersInPeriod: orders,
          sellers,
          dormantDays: settings.lifecycleThresholds.dormantDays,
          lostDays: settings.lifecycleThresholds.lostDays,
        });
        return { value: metrics.atRisk.activeAtRisk.length };
      },

      async getForecast(query: IMetricQuery) {
        const orders = await loadOrders(query.scope, query.period);
        const leadsResult = await leadsProvider.list({
          storeId: query.scope?.storeId,
          sellerId: query.scope?.sellerId,
          pageSize: 2000,
        });
        const leads = leadsResult.data ?? [];
        const realizedValue = sumBy(orders, (o) => o.total);
        const avgTicket = orders.length ? realizedValue / orders.length : undefined;
        const input = buildForecastInput({
          scope: {
            level: query.scope?.sellerId ? "individual" : "store",
            targetId: query.scope?.sellerId ?? query.scope?.storeId ?? DEFAULT_STORE_ID,
            storeId: query.scope?.storeId ?? DEFAULT_STORE_ID,
            sellerId: query.scope?.sellerId,
          },
          metric: "revenue",
          period: query.period,
          realizedValue,
          avgTicket,
          leads,
          now: new Date(),
        });
        const f = computeForecast(input, DEFAULT_FORECAST_CONFIG);
        const provavel = f.scenarios.find((s) => s.type === "provavel");
        return { value: provavel ? provavel.projectedValue : 0 };
      },
    };
  }, [ordersProvider, leadsProvider, customersProvider, sellersProvider, settingsProvider]);
}
