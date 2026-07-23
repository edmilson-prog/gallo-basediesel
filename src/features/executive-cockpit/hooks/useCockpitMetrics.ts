import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CustomerStatus, ICustomer, ID, IOrder, IQuote, ISeller } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useOrdersProvider,
  useQuotesProvider,
  useSellersProvider,
} from "@/providers/data";
import { computeTrend, type ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import {
  bucketByMonth,
  last12MonthKeys,
  sumBy,
} from "@/features/sales-analytics/utils/aggregations";
import type { ICockpitWindow } from "./useCockpitFilters";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ICockpitKpi {
  current: number;
  previous: number;
  trend: ITrendInfo;
  /** Mini sparkline series (12 months). */
  sparkline: number[];
}

export interface ICockpitKpis {
  revenue: ICockpitKpi;
  avgTicket: ICockpitKpi;
  orderCount: ICockpitKpi;
  marginPct: ICockpitKpi;
  activeCustomers: ICockpitKpi;
  positivationRate: ICockpitKpi;
  churnCount: ICockpitKpi;
  newCustomers: ICockpitKpi;
  openPipeline: ICockpitKpi;
  conversionRate: ICockpitKpi;
  pendingCommissions: ICockpitKpi;
}

export interface IRevenueOrdersPoint {
  /** YYYY-MM */
  monthKey: string;
  revenue: number;
  orderCount: number;
}

export interface IPortfolioBucket {
  status: CustomerStatus;
  count: number;
  percent: number;
}

export interface ITopSellerRow {
  sellerId: ID;
  name: string;
  revenue: number;
  orderCount: number;
}

export interface IABCMiniRow {
  class: "A" | "B" | "C";
  customerCount: number;
  revenue: number;
  revenueShare: number;
}

export interface IUseCockpitMetricsParams {
  window: ICockpitWindow;
  previousWindow: ICockpitWindow;
  scope: {
    storeId?: ID;
  };
  enabled?: boolean;
}

export interface IUseCockpitMetricsResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
  kpis: ICockpitKpis;
  revenueOrdersSeries: IRevenueOrdersPoint[];
  portfolio: { total: number; buckets: IPortfolioBucket[] };
  topSellers: ITopSellerRow[];
  abcMini: IABCMiniRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants / heuristics
// ─────────────────────────────────────────────────────────────────────────────

const STALE_MS = 30_000;
/** MVP placeholder until PRD-049 (rentabilidade) lands — fixed margin estimate. */
const MARGIN_PCT_FALLBACK = 32;
/** MVP placeholder until PRD-047 (comissões) lands — % of paid revenue assumed payable. */
const COMMISSION_PCT_FALLBACK = 0.035;
const CUSTOMER_STATUS_ORDER: CustomerStatus[] = ["ativo", "dormente", "recuperacao", "perdido"];
const TOP_SELLERS_LIMIT = 5;

function emptyKpi(): ICockpitKpi {
  return {
    current: 0,
    previous: 0,
    trend: { direction: "flat", changePct: null, isImprovement: false },
    sparkline: [],
  };
}

function inWindow(iso: string | undefined, window: ICockpitWindow): boolean {
  if (!iso) return false;
  return iso >= window.fromIso && iso <= window.toIso;
}

function buildKpi(
  current: number,
  previous: number,
  lowerIsBetter: boolean,
  sparkline: number[] = [],
): ICockpitKpi {
  return {
    current,
    previous,
    trend: computeTrend(current, previous, lowerIsBetter),
    sparkline,
  };
}

/**
 * Aggregator hook for the Executive Cockpit (PRD-040).
 *
 * Loads orders (current + previous + 12 months), quotes (current + previous),
 * customers and sellers in parallel via TanStack Query, then derives 11 strategic
 * KPIs, the 12-month revenue/orders time series, portfolio donut, top sellers,
 * and a compact ABC distribution. Stubs in place for PRD-047 (comissões) and
 * PRD-049 (margem) until those features land.
 */
export function useCockpitMetrics(params: IUseCockpitMetricsParams): IUseCockpitMetricsResult {
  const { window, previousWindow, scope, enabled = true } = params;

  const ordersProvider = useOrdersProvider();
  const quotesProvider = useQuotesProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();

  const ordersCurrentQuery = useQuery({
    queryKey: ["cockpit", "orders", "current", scope.storeId, window.fromIso, window.toIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        paymentStatus: "pago",
        since: window.fromIso,
        until: window.toIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersPreviousQuery = useQuery({
    queryKey: [
      "cockpit",
      "orders",
      "previous",
      scope.storeId,
      previousWindow.fromIso,
      previousWindow.toIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        paymentStatus: "pago",
        since: previousWindow.fromIso,
        until: previousWindow.toIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  /** Orders over the last ~13 months — fuels the 12-month chart and sparklines. */
  const ordersYearQuery = useQuery({
    queryKey: ["cockpit", "orders", "year", scope.storeId],
    queryFn: () => {
      const yearAgo = new Date();
      yearAgo.setMonth(yearAgo.getMonth() - 13);
      yearAgo.setHours(0, 0, 0, 0);
      return ordersProvider.list({
        storeId: scope.storeId,
        paymentStatus: "pago",
        since: yearAgo.toISOString(),
        pageSize: 5000,
      });
    },
    staleTime: STALE_MS,
    enabled,
  });

  const quotesCurrentQuery = useQuery({
    queryKey: ["cockpit", "quotes", "current", scope.storeId, window.fromIso, window.toIso],
    queryFn: () =>
      quotesProvider.list({
        storeId: scope.storeId,
        createdAfter: window.fromIso,
        createdBefore: window.toIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const quotesPreviousQuery = useQuery({
    queryKey: [
      "cockpit",
      "quotes",
      "previous",
      scope.storeId,
      previousWindow.fromIso,
      previousWindow.toIso,
    ],
    queryFn: () =>
      quotesProvider.list({
        storeId: scope.storeId,
        createdAfter: previousWindow.fromIso,
        createdBefore: previousWindow.toIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const customersQuery = useQuery({
    queryKey: ["cockpit", "customers", scope.storeId],
    queryFn: () =>
      customersProvider.list({ storeId: scope.storeId, pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled,
  });

  const sellersQuery = useQuery({
    queryKey: ["cockpit", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId, active: true }),
    staleTime: STALE_MS,
    enabled,
  });

  const isLoading =
    ordersCurrentQuery.isLoading ||
    ordersPreviousQuery.isLoading ||
    ordersYearQuery.isLoading ||
    quotesCurrentQuery.isLoading ||
    quotesPreviousQuery.isLoading ||
    customersQuery.isLoading ||
    sellersQuery.isLoading;

  const hasError =
    ordersCurrentQuery.isError ||
    ordersPreviousQuery.isError ||
    ordersYearQuery.isError ||
    quotesCurrentQuery.isError ||
    quotesPreviousQuery.isError ||
    customersQuery.isError ||
    sellersQuery.isError;

  const refetch = () => {
    void ordersCurrentQuery.refetch();
    void ordersPreviousQuery.refetch();
    void ordersYearQuery.refetch();
    void quotesCurrentQuery.refetch();
    void quotesPreviousQuery.refetch();
    void customersQuery.refetch();
    void sellersQuery.refetch();
  };

  // ─── Source slices ─────────────────────────────────────────────────────────
  const ordersCurrent = useMemo(
    () => ordersCurrentQuery.data?.data ?? [],
    [ordersCurrentQuery.data],
  );
  const ordersPrevious = useMemo(
    () => ordersPreviousQuery.data?.data ?? [],
    [ordersPreviousQuery.data],
  );
  const ordersYear = useMemo(() => ordersYearQuery.data?.data ?? [], [ordersYearQuery.data]);
  const quotesCurrent = useMemo(
    () => quotesCurrentQuery.data?.data ?? [],
    [quotesCurrentQuery.data],
  );
  const quotesPrevious = useMemo(
    () => quotesPreviousQuery.data?.data ?? [],
    [quotesPreviousQuery.data],
  );
  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const sellers = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);

  // ─── 12-month buckets (revenue + orders) ───────────────────────────────────
  const revenueOrdersSeries = useMemo<IRevenueOrdersPoint[]>(() => {
    const buckets = bucketByMonth(ordersYear, (o) => o.paidAt);
    return last12MonthKeys().map((monthKey) => {
      const ordersInMonth = buckets.get(monthKey) ?? [];
      const revenue = sumBy(ordersInMonth, (o) => o.total);
      return { monthKey, revenue, orderCount: ordersInMonth.length };
    });
  }, [ordersYear]);

  const revenueSparkline = useMemo(
    () => revenueOrdersSeries.map((p) => p.revenue),
    [revenueOrdersSeries],
  );
  const ordersSparkline = useMemo(
    () => revenueOrdersSeries.map((p) => p.orderCount),
    [revenueOrdersSeries],
  );

  // ─── KPI computations ──────────────────────────────────────────────────────
  const kpis = useMemo<ICockpitKpis>(() => {
    const revCurrent = sumBy(ordersCurrent, (o) => o.total);
    const revPrevious = sumBy(ordersPrevious, (o) => o.total);
    const cntCurrent = ordersCurrent.length;
    const cntPrevious = ordersPrevious.length;
    const ticketCurrent = cntCurrent > 0 ? revCurrent / cntCurrent : 0;
    const ticketPrevious = cntPrevious > 0 ? revPrevious / cntPrevious : 0;

    const marginCurrent = sumOrderMargin(ordersCurrent);
    const marginPrevious = sumOrderMargin(ordersPrevious);
    const marginPctCurrent =
      revCurrent > 0
        ? Math.round(
            ((marginCurrent || revCurrent * (MARGIN_PCT_FALLBACK / 100)) / revCurrent) * 1000,
          ) / 10
        : MARGIN_PCT_FALLBACK;
    const marginPctPrevious =
      revPrevious > 0
        ? Math.round(
            ((marginPrevious || revPrevious * (MARGIN_PCT_FALLBACK / 100)) / revPrevious) * 1000,
          ) / 10
        : MARGIN_PCT_FALLBACK;

    // Active customers — current = all status===ativo. Previous = approximation
    // based on customers created before window.fromIso AND still active today
    // (best effort without historical snapshots).
    const activeNow = customers.filter((c) => c.status === "ativo");
    const activePrev = customers.filter(
      (c) => c.status === "ativo" && c.createdAt <= previousWindow.toIso,
    );

    // Positivation rate — share of active customers who placed at least one
    // paid order in the window.
    const buyersCurrent = new Set<ID>();
    for (const o of ordersCurrent) buyersCurrent.add(o.customerId);
    const buyersPrevious = new Set<ID>();
    for (const o of ordersPrevious) buyersPrevious.add(o.customerId);
    const posRateCurrent =
      activeNow.length > 0 ? Math.round((buyersCurrent.size / activeNow.length) * 1000) / 10 : 0;
    const posRatePrevious =
      activePrev.length > 0 ? Math.round((buyersPrevious.size / activePrev.length) * 1000) / 10 : 0;

    // Churn — customers whose `lastPurchaseAt` falls outside the window AND
    // status moved to `perdido`. MVP heuristic: count of `perdido` customers
    // whose last purchase is in the previous window. Compared against the
    // count of `perdido` customers whose last purchase is in the previous-previous.
    const churnCurrent = customers.filter(
      (c) => c.status === "perdido" && inWindow(c.lastPurchaseAt, previousWindow),
    ).length;
    const churnPrevious = customers.filter(
      (c) =>
        c.status === "perdido" &&
        c.lastPurchaseAt !== undefined &&
        c.lastPurchaseAt < previousWindow.fromIso,
    ).length;

    // New customers — created inside window.
    const newCurrent = customers.filter((c) => inWindow(c.createdAt, window)).length;
    const newPrevious = customers.filter((c) => inWindow(c.createdAt, previousWindow)).length;

    // Open pipeline — sum of `enviado` + `aceito` quotes not yet converted.
    const openPipelineCurrent = sumBy(
      quotesCurrent.filter((q) => q.status === "enviado" || q.status === "aceito"),
      (q) => q.total,
    );
    const openPipelinePrevious = sumBy(
      quotesPrevious.filter((q) => q.status === "enviado" || q.status === "aceito"),
      (q) => q.total,
    );

    // Conversion rate — convertido / enviado(+aceito+convertido).
    const convertedC = quotesCurrent.filter((q) => q.status === "convertido").length;
    const sentC = quotesCurrent.filter(
      (q) => q.status === "enviado" || q.status === "aceito" || q.status === "convertido",
    ).length;
    const convertedP = quotesPrevious.filter((q) => q.status === "convertido").length;
    const sentP = quotesPrevious.filter(
      (q) => q.status === "enviado" || q.status === "aceito" || q.status === "convertido",
    ).length;
    const convRateCurrent = sentC > 0 ? Math.round((convertedC / sentC) * 1000) / 10 : 0;
    const convRatePrevious = sentP > 0 ? Math.round((convertedP / sentP) * 1000) / 10 : 0;

    // Commissions to pay — stub until PRD-047 lands.
    const commissionsCurrent = Math.round(revCurrent * COMMISSION_PCT_FALLBACK);
    const commissionsPrevious = Math.round(revPrevious * COMMISSION_PCT_FALLBACK);

    return {
      revenue: buildKpi(revCurrent, revPrevious, false, revenueSparkline),
      avgTicket: buildKpi(ticketCurrent, ticketPrevious, false),
      orderCount: buildKpi(cntCurrent, cntPrevious, false, ordersSparkline),
      marginPct: buildKpi(marginPctCurrent, marginPctPrevious, false),
      activeCustomers: buildKpi(activeNow.length, activePrev.length, false),
      positivationRate: buildKpi(posRateCurrent, posRatePrevious, false),
      churnCount: buildKpi(churnCurrent, churnPrevious, true),
      newCustomers: buildKpi(newCurrent, newPrevious, false),
      openPipeline: buildKpi(openPipelineCurrent, openPipelinePrevious, false),
      conversionRate: buildKpi(convRateCurrent, convRatePrevious, false),
      pendingCommissions: buildKpi(commissionsCurrent, commissionsPrevious, true),
    };
  }, [
    ordersCurrent,
    ordersPrevious,
    quotesCurrent,
    quotesPrevious,
    customers,
    window,
    previousWindow,
    revenueSparkline,
    ordersSparkline,
  ]);

  // ─── Portfolio donut ───────────────────────────────────────────────────────
  const portfolio = useMemo(() => {
    const total = customers.length;
    const counts = new Map<CustomerStatus, number>();
    for (const status of CUSTOMER_STATUS_ORDER) counts.set(status, 0);
    for (const c of customers) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    const buckets: IPortfolioBucket[] = CUSTOMER_STATUS_ORDER.map((status) => {
      const count = counts.get(status) ?? 0;
      return { status, count, percent: total === 0 ? 0 : Math.round((count / total) * 100) };
    });
    return { total, buckets };
  }, [customers]);

  // ─── Top sellers ───────────────────────────────────────────────────────────
  const topSellers = useMemo<ITopSellerRow[]>(() => {
    const totals = new Map<ID, { revenue: number; orderCount: number }>();
    for (const order of ordersCurrent) {
      const bucket = totals.get(order.sellerId) ?? { revenue: 0, orderCount: 0 };
      bucket.revenue += order.total;
      bucket.orderCount += 1;
      totals.set(order.sellerId, bucket);
    }
    const sellerNameById = new Map<ID, string>();
    for (const s of sellers) sellerNameById.set(s.id, s.fullName);
    const rows: ITopSellerRow[] = [];
    for (const [sellerId, { revenue, orderCount }] of totals) {
      rows.push({
        sellerId,
        name: sellerNameById.get(sellerId) ?? "—",
        revenue,
        orderCount,
      });
    }
    return rows.sort((a, b) => b.revenue - a.revenue).slice(0, TOP_SELLERS_LIMIT);
  }, [ordersCurrent, sellers]);

  // ─── ABC mini ──────────────────────────────────────────────────────────────
  const abcMini = useMemo<IABCMiniRow[]>(() => {
    // Build per-customer revenue from current orders.
    const totals = new Map<ID, number>();
    for (const order of ordersCurrent) {
      totals.set(order.customerId, (totals.get(order.customerId) ?? 0) + order.total);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const totalRevenue = sumBy(ranked, ([, v]) => v);
    if (totalRevenue === 0 || ranked.length === 0) {
      return [
        { class: "A", customerCount: 0, revenue: 0, revenueShare: 0 },
        { class: "B", customerCount: 0, revenue: 0, revenueShare: 0 },
        { class: "C", customerCount: 0, revenue: 0, revenueShare: 0 },
      ];
    }
    const aThreshold = 0.8;
    const bThreshold = 0.95;
    let cumulative = 0;
    const classByCustomer = new Map<ID, "A" | "B" | "C">();
    for (const [customerId, revenue] of ranked) {
      cumulative += revenue;
      const share = cumulative / totalRevenue;
      if (share <= aThreshold) classByCustomer.set(customerId, "A");
      else if (share <= bThreshold) classByCustomer.set(customerId, "B");
      else classByCustomer.set(customerId, "C");
    }
    const out: Record<"A" | "B" | "C", { count: number; revenue: number }> = {
      A: { count: 0, revenue: 0 },
      B: { count: 0, revenue: 0 },
      C: { count: 0, revenue: 0 },
    };
    for (const [customerId, revenue] of ranked) {
      const klass = classByCustomer.get(customerId) ?? "C";
      out[klass].count += 1;
      out[klass].revenue += revenue;
    }
    return (["A", "B", "C"] as const).map((klass) => ({
      class: klass,
      customerCount: out[klass].count,
      revenue: out[klass].revenue,
      revenueShare: totalRevenue > 0 ? out[klass].revenue / totalRevenue : 0,
    }));
  }, [ordersCurrent]);

  return {
    isLoading,
    hasError,
    refetch,
    kpis,
    revenueOrdersSeries,
    portfolio,
    topSellers,
    abcMini,
  };
}

/** Total margin across an order list — falls back to 0 when `marginValue` is absent. */
function sumOrderMargin(orders: IOrder[]): number {
  let total = 0;
  for (const o of orders) for (const i of o.items) total += i.marginValue ?? 0;
  return total;
}

// Silence unused-import warnings — types are part of the public hook surface.
export type { ICustomer, IQuote, ISeller };
