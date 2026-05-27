import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, IOrder } from "@/shared/types";
import {
  useCustomersProvider,
  useOrdersProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import {
  calculatePortfolioMetrics,
  type IPortfolioMetrics,
} from "../engine/calculatePortfolioMetrics";
import type { IPortfolioWindow } from "./usePortfolioFilters";

const STALE_MS = 30_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_DORMANT_DAYS = 90;
const FALLBACK_LOST_DAYS = 365;

export interface IUsePortfolioMetricsParams {
  window: IPortfolioWindow;
  scope: {
    storeId?: ID;
    sellerId?: ID;
  };
  atRiskWindowDays?: number;
  enabled?: boolean;
}

/**
 * Single point in the temporal evolution chart — count of customers by status
 * at the end of each sampling bucket.
 */
export interface IPortfolioEvolutionPoint {
  /** ISO date "YYYY-MM-DD" anchoring the end of the bucket. */
  bucket: string;
  ativo: number;
  dormente: number;
  perdido: number;
  recuperacao: number;
}

export interface IUsePortfolioMetricsResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
  metrics: IPortfolioMetrics | null;
  evolution: IPortfolioEvolutionPoint[];
  dormantDays: number;
  lostDays: number;
}

/**
 * Sample the lifecycle status of every customer at the END of a series of
 * monthly buckets between `start` and `end`. We use the timeline rule
 * (lastPurchaseAt vs thresholds) to derive the status at each bucket boundary,
 * giving a "movie" of the portfolio composition.
 */
function buildEvolutionSeries(
  customers: ICustomer[],
  ordersAll: IOrder[],
  startIso: string,
  endIso: string,
  dormantDays: number,
  lostDays: number,
): IPortfolioEvolutionPoint[] {
  const start = new Date(startIso);
  const end = new Date(endIso);

  // Build a per-customer last-purchase-up-to-date cache. Sort orders by paidAt
  // ascending so we can advance a pointer per customer.
  const ordersByCustomer = new Map<ID, IOrder[]>();
  for (const order of ordersAll) {
    if (!order.paidAt) continue;
    const bucket = ordersByCustomer.get(order.customerId) ?? [];
    bucket.push(order);
    ordersByCustomer.set(order.customerId, bucket);
  }
  for (const orders of ordersByCustomer.values()) {
    orders.sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));
  }

  const points: IPortfolioEvolutionPoint[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);

  // Iterate one bucket per month boundary up to `end`.
  while (cursor.getTime() <= end.getTime()) {
    const refTime = cursor.getTime();
    let ativo = 0;
    let dormente = 0;
    let perdido = 0;
    let recuperacao = 0;

    for (const customer of customers) {
      // Only count customers that already existed by the reference date.
      if (customer.createdAt && new Date(customer.createdAt).getTime() > refTime) continue;

      // Find the most recent paid order up to refTime.
      const orders = ordersByCustomer.get(customer.id);
      let lastPaid: string | undefined;
      if (orders) {
        for (let i = orders.length - 1; i >= 0; i -= 1) {
          const paidAt = orders[i].paidAt;
          if (paidAt && new Date(paidAt).getTime() <= refTime) {
            lastPaid = paidAt;
            break;
          }
        }
      }
      const reference = lastPaid ?? customer.lastPurchaseAt;
      if (!reference) {
        // No purchase ever — count as active for newly created customers,
        // matching the lifecycle interpretation used elsewhere.
        ativo += 1;
        continue;
      }
      const daysSince = Math.floor((refTime - new Date(reference).getTime()) / MS_PER_DAY);
      if (daysSince <= dormantDays) ativo += 1;
      else if (daysSince <= lostDays) dormente += 1;
      else perdido += 1;
    }

    // Preserve `recuperacao` snapshot from current persisted state at the last
    // bucket only — historic reconstruction would require an audit trail that
    // the mocked dataset does not maintain. For prior buckets the bucket is 0.
    if (cursor.getTime() >= end.getTime() - MS_PER_DAY) {
      for (const c of customers) {
        if (c.status === "recuperacao") recuperacao += 1;
      }
    }

    points.push({
      bucket: cursor.toISOString().slice(0, 10),
      ativo,
      dormente,
      perdido,
      recuperacao,
    });

    // Advance to end-of-next-month.
    cursor.setMonth(cursor.getMonth() + 2, 0);
    cursor.setHours(23, 59, 59, 0);
  }

  return points;
}

/**
 * Aggregator hook for portfolio analytics (PRD-046).
 *
 * Loads customers, paid orders in the window AND the full history (needed for
 * the evolution series) plus platform settings. Delegates math to the pure
 * {@link calculatePortfolioMetrics} engine.
 *
 * Exported from `src/features/portfolio-analytics` and consumed by:
 *  - `PortfolioAnalyticsPage` (PRD-046 main UI)
 *  - `SellerPortfolioPage` (PRD-046 drill-down)
 *  - `<PortfolioHealthWidget />` (PRD-014 manager dashboard)
 */
export function usePortfolioMetrics(
  params: IUsePortfolioMetricsParams,
): IUsePortfolioMetricsResult {
  const { window, scope, atRiskWindowDays = 15, enabled = true } = params;

  const customersProvider = useCustomersProvider();
  const ordersProvider = useOrdersProvider();
  const sellersProvider = useSellersProvider();
  const settingsProvider = useSettingsProvider();

  const customersQuery = useQuery({
    queryKey: ["portfolio", "customers", scope.storeId, scope.sellerId],
    queryFn: () =>
      customersProvider.list({
        storeId: scope.storeId,
        sellerIds: scope.sellerId ? [scope.sellerId] : undefined,
        pageSize: 3000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersWindowQuery = useQuery({
    queryKey: [
      "portfolio",
      "orders",
      "window",
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

  // Full history for the evolution chart: aggregate per-month buckets ending in
  // the window, but we need every paid order up to `window.toIso` to know each
  // customer's last purchase at every bucket boundary.
  const ordersHistoryQuery = useQuery({
    queryKey: [
      "portfolio",
      "orders",
      "history",
      scope.storeId,
      scope.sellerId,
      window.toIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        until: window.toIso,
        pageSize: 10000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const sellersQuery = useQuery({
    queryKey: ["portfolio", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId, active: true }),
    staleTime: STALE_MS,
    enabled,
  });

  const settingsQuery = useQuery({
    queryKey: ["portfolio", "settings", scope.storeId ?? "default"],
    queryFn: () => settingsProvider.get(scope.storeId ?? "store-matriz"),
    staleTime: 5 * 60_000,
    enabled,
  });

  const isLoading =
    customersQuery.isLoading ||
    ordersWindowQuery.isLoading ||
    ordersHistoryQuery.isLoading ||
    sellersQuery.isLoading ||
    settingsQuery.isLoading;

  const hasError =
    customersQuery.isError ||
    ordersWindowQuery.isError ||
    ordersHistoryQuery.isError ||
    sellersQuery.isError ||
    settingsQuery.isError;

  const refetch = () => {
    void customersQuery.refetch();
    void ordersWindowQuery.refetch();
    void ordersHistoryQuery.refetch();
    void sellersQuery.refetch();
    void settingsQuery.refetch();
  };

  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const ordersWindow = useMemo(
    () => ordersWindowQuery.data?.data ?? [],
    [ordersWindowQuery.data],
  );
  const ordersHistory = useMemo(
    () => ordersHistoryQuery.data?.data ?? [],
    [ordersHistoryQuery.data],
  );
  const sellers = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);

  const dormantDays =
    settingsQuery.data?.lifecycleThresholds.dormantDays ?? FALLBACK_DORMANT_DAYS;
  const lostDays = settingsQuery.data?.lifecycleThresholds.lostDays ?? FALLBACK_LOST_DAYS;

  const metrics = useMemo<IPortfolioMetrics | null>(() => {
    if (isLoading || hasError) return null;
    return calculatePortfolioMetrics(window.fromIso, window.toIso, {
      customers,
      ordersInPeriod: ordersWindow,
      sellers,
      dormantDays,
      lostDays,
      atRiskWindowDays,
    });
  }, [
    isLoading,
    hasError,
    window,
    customers,
    ordersWindow,
    sellers,
    dormantDays,
    lostDays,
    atRiskWindowDays,
  ]);

  const evolution = useMemo<IPortfolioEvolutionPoint[]>(() => {
    if (!metrics) return [];
    return buildEvolutionSeries(
      customers,
      ordersHistory,
      window.fromIso,
      window.toIso,
      dormantDays,
      lostDays,
    );
  }, [metrics, customers, ordersHistory, window, dormantDays, lostDays]);

  return {
    isLoading,
    hasError,
    refetch,
    metrics,
    evolution,
    dormantDays,
    lostDays,
  };
}
