import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import {
  useCustomersProvider,
  useOrdersProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { computeTrend, type ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import { calculatePositivation, type IPositivationMetrics } from "../engine/calculatePositivation";
import type { IPositivationWindow } from "./usePositivationFilters";

export interface IUsePositivationMetricsParams {
  window: IPositivationWindow;
  /** Comparison window (defaults to "previous period of same length"). */
  previousWindow?: IPositivationWindow;
  scope: {
    storeId?: ID;
    sellerId?: ID;
  };
  /** Lookahead window in days for the "at risk" computation. Default 15. */
  atRiskWindowDays?: number;
  enabled?: boolean;
}

export interface IPositivationDailyPoint {
  /** ISO date "YYYY-MM-DD". */
  day: string;
  /** Cumulative positivated count up to this day. */
  cumulative: number;
  /** Linear expectation at this day. */
  expected: number;
}

export interface IUsePositivationMetricsResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
  metrics: IPositivationMetrics | null;
  previousMetrics: IPositivationMetrics | null;
  trends: {
    positivationRate: ITrendInfo;
    positivatedCount: ITrendInfo;
    atRisk: ITrendInfo;
  };
  /** Daily series for the evolution chart. */
  daily: IPositivationDailyPoint[];
}

const STALE_MS = 30_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_DORMANT_DAYS = 90;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function buildDailySeries(
  ordersInPeriod: { customerId: ID; paidAt?: string }[],
  window: IPositivationWindow,
  totalEligible: number,
  now: Date = new Date(),
): IPositivationDailyPoint[] {
  const start = new Date(window.fromIso).getTime();
  const end = new Date(window.toIso).getTime();
  const totalDays = Math.max(1, Math.ceil((end - start) / MS_PER_DAY));

  const seen = new Set<ID>();
  const firstByDay = new Map<string, number>();
  // Sort orders by paidAt asc so the first occurrence per customer wins.
  const sorted = [...ordersInPeriod]
    .filter((o) => o.paidAt)
    .sort((a, b) => (a.paidAt as string).localeCompare(b.paidAt as string));
  for (const order of sorted) {
    if (seen.has(order.customerId)) continue;
    seen.add(order.customerId);
    const key = dayKey(order.paidAt as string);
    firstByDay.set(key, (firstByDay.get(key) ?? 0) + 1);
  }

  const finalProjection = Math.max(1, Math.min(totalEligible, seen.size));
  const points: IPositivationDailyPoint[] = [];
  let cumulative = 0;
  const today = now.getTime();
  for (let i = 0; i < totalDays; i += 1) {
    const day = new Date(start + i * MS_PER_DAY);
    const key = dayKey(day.toISOString());
    cumulative += firstByDay.get(key) ?? 0;
    const expected = Math.round((finalProjection * (i + 1)) / totalDays);
    points.push({
      day: key,
      cumulative: day.getTime() <= today ? cumulative : Number.NaN,
      expected,
    });
  }
  return points;
}

/**
 * Aggregator hook for positivation metrics (PRD-044).
 *
 * Loads active customers, paid orders in the period, sellers and platform
 * settings (for the dormant threshold) in parallel via TanStack Query, then
 * delegates the math to the pure {@link calculatePositivation} engine. Trends
 * vs the previous period are computed by re-running the engine on the prior
 * window.
 *
 * Exported from `src/features/positivation` and consumed by:
 *  - `PositivationPage` (PRD-044 main UI)
 *  - `SellerPositivationPage` (PRD-044 drill-down)
 *  - `<PositivationWidget />` (PRD-014 manager dashboard)
 *  - Executive Cockpit (PRD-040) — future swap of the stub
 */
export function usePositivationMetrics(
  params: IUsePositivationMetricsParams,
): IUsePositivationMetricsResult {
  const { window, previousWindow, scope, atRiskWindowDays = 15, enabled = true } = params;

  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const settingsProvider = useSettingsProvider();

  const customersQuery = useQuery({
    queryKey: ["positivation", "customers", scope.storeId, scope.sellerId],
    queryFn: () =>
      customersProvider.list({
        storeId: scope.storeId,
        sellerIds: scope.sellerId ? [scope.sellerId] : undefined,
        pageSize: 3000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersCurrentQuery = useQuery({
    queryKey: [
      "positivation",
      "orders",
      "current",
      scope.storeId,
      scope.sellerId,
      window.fromIso,
      window.toIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: window.fromIso,
        until: window.toIso,
        pageSize: 5000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersPreviousQuery = useQuery({
    queryKey: previousWindow
      ? [
          "positivation",
          "orders",
          "previous",
          scope.storeId,
          scope.sellerId,
          previousWindow.fromIso,
          previousWindow.toIso,
        ]
      : ["positivation", "orders", "previous", "noop"],
    queryFn: () =>
      previousWindow
        ? ordersProvider.list({
            storeId: scope.storeId,
            sellerId: scope.sellerId,
            paymentStatus: "pago",
            since: previousWindow.fromIso,
            until: previousWindow.toIso,
            pageSize: 5000,
          })
        : Promise.resolve({ data: [], total: 0, page: 1, pageSize: 0 }),
    staleTime: STALE_MS,
    enabled: enabled && Boolean(previousWindow),
  });

  const sellersQuery = useQuery({
    queryKey: ["positivation", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId, active: true }),
    staleTime: STALE_MS,
    enabled,
  });

  const settingsQuery = useQuery({
    queryKey: ["positivation", "settings", scope.storeId ?? "default"],
    queryFn: () => settingsProvider.get(scope.storeId ?? "store-matriz"),
    staleTime: 5 * 60_000,
    enabled,
  });

  const isLoading =
    customersQuery.isLoading ||
    ordersCurrentQuery.isLoading ||
    (previousWindow ? ordersPreviousQuery.isLoading : false) ||
    sellersQuery.isLoading ||
    settingsQuery.isLoading;

  const hasError =
    customersQuery.isError ||
    ordersCurrentQuery.isError ||
    (previousWindow ? ordersPreviousQuery.isError : false) ||
    sellersQuery.isError ||
    settingsQuery.isError;

  const refetch = () => {
    void customersQuery.refetch();
    void ordersCurrentQuery.refetch();
    if (previousWindow) void ordersPreviousQuery.refetch();
    void sellersQuery.refetch();
    void settingsQuery.refetch();
  };

  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const ordersCurrent = useMemo(
    () => ordersCurrentQuery.data?.data ?? [],
    [ordersCurrentQuery.data],
  );
  const ordersPrevious = useMemo(
    () => ordersPreviousQuery.data?.data ?? [],
    [ordersPreviousQuery.data],
  );
  const sellers = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const dormantDays = settingsQuery.data?.lifecycleThresholds.dormantDays ?? FALLBACK_DORMANT_DAYS;

  const metrics = useMemo<IPositivationMetrics | null>(() => {
    if (isLoading || hasError) return null;
    return calculatePositivation(window.fromIso, window.toIso, {
      customers,
      ordersInPeriod: ordersCurrent,
      sellers,
      dormantDays,
      atRiskWindowDays,
    });
  }, [
    isLoading,
    hasError,
    window,
    customers,
    ordersCurrent,
    sellers,
    dormantDays,
    atRiskWindowDays,
  ]);

  const previousMetrics = useMemo<IPositivationMetrics | null>(() => {
    if (!previousWindow || isLoading || hasError) return null;
    return calculatePositivation(previousWindow.fromIso, previousWindow.toIso, {
      customers,
      ordersInPeriod: ordersPrevious,
      sellers,
      dormantDays,
      atRiskWindowDays,
    });
  }, [
    previousWindow,
    isLoading,
    hasError,
    customers,
    ordersPrevious,
    sellers,
    dormantDays,
    atRiskWindowDays,
  ]);

  const trends = useMemo(() => {
    const empty: ITrendInfo = { direction: "flat", changePct: null, isImprovement: false };
    if (!metrics || !previousMetrics) {
      return { positivationRate: empty, positivatedCount: empty, atRisk: empty };
    }
    return {
      positivationRate: computeTrend(
        Math.round(metrics.positivationRate * 1000) / 10,
        Math.round(previousMetrics.positivationRate * 1000) / 10,
        false,
      ),
      positivatedCount: computeTrend(
        metrics.positivatedCount,
        previousMetrics.positivatedCount,
        false,
      ),
      atRisk: computeTrend(metrics.atRisk.length, previousMetrics.atRisk.length, true),
    };
  }, [metrics, previousMetrics]);

  const daily = useMemo<IPositivationDailyPoint[]>(() => {
    if (!metrics) return [];
    return buildDailySeries(ordersCurrent, window, metrics.totalCustomers);
  }, [metrics, ordersCurrent, window]);

  return {
    isLoading,
    hasError,
    refetch,
    metrics,
    previousMetrics,
    trends,
    daily,
  };
}
