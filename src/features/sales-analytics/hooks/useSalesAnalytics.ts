import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, ICustomer, IOrder, IOrderItem, IPart } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";
import {
  useCustomersProvider,
  useOrdersProvider,
  usePartsProvider,
  useSellersProvider,
} from "@/providers/data";
import { computeTrend, type ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import {
  bucketByMonth,
  groupBy,
  last12MonthKeys,
  percentOfTotal,
  sumBy,
  topN,
  trendPct,
} from "../utils/aggregations";
import { computeSeasonalitySignal, type ISeasonalitySignal } from "../utils/seasonality";
import {
  originToChannel,
  type ISalesFiltersState,
  type ISalesWindow,
  type SalesChannel,
} from "./useSalesFilters";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ISalesKpis {
  revenue: { current: number; previous: number; trend: ITrendInfo };
  orderCount: { current: number; previous: number; trend: ITrendInfo };
  avgTicket: { current: number; previous: number; trend: ITrendInfo };
  marginPct: { current: number; previous: number; trend: ITrendInfo };
}

export interface IRevenueMonthlyPoint {
  /** YYYY-MM */
  monthKey: string;
  revenue: number;
}

export interface ICategoryBreakdownItem {
  category: PartCategory | "outros";
  revenue: number;
  share: number;
}

export interface IVehicleBrandBreakdownItem {
  brand: string;
  revenue: number;
  orderCount: number;
}

export interface IChannelBreakdownItem {
  channel: SalesChannel;
  revenue: number;
  share: number;
}

export interface ITopProductRow {
  partId: ID;
  sku: string;
  name: string;
  category: PartCategory | undefined;
  quantity: number;
  revenue: number;
  share: number;
  previousRevenue: number;
  trendPctValue: number | null;
}

export interface ITopCustomerRow {
  customerId: ID;
  name: string;
  abcClass: "A" | "B" | "C";
  orderCount: number;
  revenue: number;
  avgTicket: number;
  sellerId: ID;
  sellerName: string;
  isNew: boolean;
}

export interface INewVsRecurringSnapshot {
  newCustomers: number;
  recurringCustomers: number;
  revenueFromNew: number;
  revenueFromRecurring: number;
  newShare: number;
}

export interface IUseSalesAnalyticsParams {
  filters: ISalesFiltersState;
  window: ISalesWindow;
  previousWindow: ISalesWindow;
  /** Scope-restricting params resolved by the page (RBAC). */
  scope: {
    storeId?: ID;
    sellerId?: ID;
  };
}

export interface IUseSalesAnalyticsResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;

  /** Raw data (filtered to scope+window). */
  ordersCurrent: IOrder[];
  ordersPrevious: IOrder[];
  customers: ICustomer[];
  parts: IPart[];
  /** Lookup partId → IPart. */
  partsById: Map<ID, IPart>;
  /** Lookup customerId → ICustomer. */
  customersById: Map<ID, ICustomer>;

  // Derived
  kpis: ISalesKpis;
  monthlyRevenue: IRevenueMonthlyPoint[];
  categoryBreakdown: ICategoryBreakdownItem[];
  vehicleBrandBreakdown: IVehicleBrandBreakdownItem[];
  channelBreakdown: IChannelBreakdownItem[];
  topProducts: ITopProductRow[];
  topCustomers: ITopCustomerRow[];
  productsInDecline: ITopProductRow[];
  newVsRecurring: INewVsRecurringSnapshot;
  seasonality: ISeasonalitySignal | null;
  availableBrands: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TOP_N = 20;
const DECLINE_THRESHOLD_PCT = -30;

/** Resolve the primary vehicle brand for a part — first application or undefined. */
function primaryVehicleBrand(part: IPart | undefined): string | undefined {
  return part?.applications?.[0]?.vehicleBrand;
}

/** Get the canonical category for a part — falls back to "outros" if missing. */
function partCategory(part: IPart | undefined): PartCategory | "outros" {
  return part?.category ?? "outros";
}

function customerDisplayName(customer: ICustomer | undefined): string {
  if (!customer) return "—";
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return customer.fullName;
}

function matchesItemFilters(
  item: IOrderItem,
  partsById: Map<ID, IPart>,
  filters: ISalesFiltersState,
): boolean {
  const part = partsById.get(item.partId);
  if (filters.category !== "all" && partCategory(part) !== filters.category) return false;
  if (filters.vehicleBrand !== "all" && primaryVehicleBrand(part) !== filters.vehicleBrand) {
    return false;
  }
  return true;
}

function orderHasMatchingItem(
  order: IOrder,
  partsById: Map<ID, IPart>,
  filters: ISalesFiltersState,
): boolean {
  if (filters.category === "all" && filters.vehicleBrand === "all") return true;
  return order.items.some((item) => matchesItemFilters(item, partsById, filters));
}

function applyOrderFilters(
  orders: IOrder[],
  partsById: Map<ID, IPart>,
  filters: ISalesFiltersState,
): IOrder[] {
  return orders.filter((o) => {
    if (filters.channel !== "all" && originToChannel(o.origin) !== filters.channel) return false;
    return orderHasMatchingItem(o, partsById, filters);
  });
}

/** Sum the matching-item revenue contribution of an order under the current filters. */
function matchingRevenue(
  order: IOrder,
  partsById: Map<ID, IPart>,
  filters: ISalesFiltersState,
): number {
  if (filters.category === "all" && filters.vehicleBrand === "all") return order.total;
  return sumBy(
    order.items.filter((i) => matchesItemFilters(i, partsById, filters)),
    (i) => i.total,
  );
}

/** Sum matching item margin contribution under the current filters. */
function matchingMargin(
  order: IOrder,
  partsById: Map<ID, IPart>,
  filters: ISalesFiltersState,
): number {
  if (filters.category === "all" && filters.vehicleBrand === "all") {
    return sumBy(order.items, (i) => i.marginValue);
  }
  return sumBy(
    order.items.filter((i) => matchesItemFilters(i, partsById, filters)),
    (i) => i.marginValue,
  );
}

function aggregateProducts(
  orders: IOrder[],
  partsById: Map<ID, IPart>,
  filters: ISalesFiltersState,
): Map<ID, { quantity: number; revenue: number; sku: string; name: string }> {
  const out = new Map<ID, { quantity: number; revenue: number; sku: string; name: string }>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!matchesItemFilters(item, partsById, filters)) continue;
      const prev = out.get(item.partId);
      if (prev) {
        prev.quantity += item.quantity;
        prev.revenue += item.total;
      } else {
        out.set(item.partId, {
          quantity: item.quantity,
          revenue: item.total,
          sku: item.partSku,
          name: item.partName,
        });
      }
    }
  }
  return out;
}

/** Heuristic ABC classification (MVP placeholder — real implementation lives in PRD-045). */
function classifyABC(rows: { customerId: ID; revenue: number }[]): Map<ID, "A" | "B" | "C"> {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const out = new Map<ID, "A" | "B" | "C">();
  const aThreshold = Math.max(1, Math.ceil(sorted.length * 0.2));
  const bThreshold = aThreshold + Math.max(1, Math.ceil(sorted.length * 0.3));
  sorted.forEach((row, idx) => {
    if (idx < aThreshold) out.set(row.customerId, "A");
    else if (idx < bThreshold) out.set(row.customerId, "B");
    else out.set(row.customerId, "C");
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

const STALE_MS = 30_000;

export function useSalesAnalytics(params: IUseSalesAnalyticsParams): IUseSalesAnalyticsResult {
  const { filters, window, previousWindow, scope } = params;

  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const partsProvider = usePartsProvider();
  const sellersProvider = useSellersProvider();

  const ordersCurrentQuery = useQuery({
    queryKey: [
      "sales-analytics",
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
        pageSize: 1000,
      }),
    staleTime: STALE_MS,
  });

  const ordersPreviousQuery = useQuery({
    queryKey: [
      "sales-analytics",
      "orders",
      "previous",
      scope.storeId,
      scope.sellerId,
      previousWindow.fromIso,
      previousWindow.toIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: previousWindow.fromIso,
        until: previousWindow.toIso,
        pageSize: 1000,
      }),
    staleTime: STALE_MS,
  });

  /** Orders over the last 12 months — used for the time series chart + seasonality YoY. */
  const ordersYearQuery = useQuery({
    queryKey: ["sales-analytics", "orders", "year", scope.storeId, scope.sellerId],
    queryFn: () => {
      const yearAgo = new Date();
      yearAgo.setMonth(yearAgo.getMonth() - 13);
      yearAgo.setHours(0, 0, 0, 0);
      return ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: yearAgo.toISOString(),
        pageSize: 5000,
      });
    },
    staleTime: STALE_MS,
  });

  const customersQuery = useQuery({
    queryKey: ["sales-analytics", "customers", scope.storeId],
    queryFn: () => customersProvider.list({ storeId: scope.storeId, pageSize: 2000 }),
    staleTime: STALE_MS,
  });

  const partsQuery = useQuery({
    queryKey: ["sales-analytics", "parts"],
    queryFn: () => partsProvider.list({ pageSize: 2000 }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["sales-analytics", "sellers"],
    queryFn: () => sellersProvider.list(),
    staleTime: STALE_MS,
  });

  const isLoading =
    ordersCurrentQuery.isLoading ||
    ordersPreviousQuery.isLoading ||
    ordersYearQuery.isLoading ||
    customersQuery.isLoading ||
    partsQuery.isLoading;

  const hasError =
    ordersCurrentQuery.isError ||
    ordersPreviousQuery.isError ||
    ordersYearQuery.isError ||
    customersQuery.isError ||
    partsQuery.isError;

  const refetch = () => {
    void ordersCurrentQuery.refetch();
    void ordersPreviousQuery.refetch();
    void ordersYearQuery.refetch();
    void customersQuery.refetch();
    void partsQuery.refetch();
  };

  // ─── Lookups ────────────────────────────────────────────────────────────────
  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    const items = partsQuery.data?.data ?? [];
    for (const p of items) map.set(p.id, p);
    return map;
  }, [partsQuery.data]);

  const customersById = useMemo(() => {
    const map = new Map<ID, ICustomer>();
    const items = customersQuery.data?.data ?? [];
    for (const c of items) map.set(c.id, c);
    return map;
  }, [customersQuery.data]);

  const sellerNameById = useMemo(() => {
    const map = new Map<ID, string>();
    const items = sellersQuery.data ?? [];
    for (const s of items) map.set(s.id, s.fullName);
    return map;
  }, [sellersQuery.data]);

  // ─── Apply UI filters (category, brand, channel) ──────────────────────────
  const ordersCurrent = useMemo(() => {
    const raw = ordersCurrentQuery.data?.data ?? [];
    return applyOrderFilters(raw, partsById, filters);
  }, [ordersCurrentQuery.data, partsById, filters]);

  const ordersPrevious = useMemo(() => {
    const raw = ordersPreviousQuery.data?.data ?? [];
    return applyOrderFilters(raw, partsById, filters);
  }, [ordersPreviousQuery.data, partsById, filters]);

  const ordersYear = useMemo(() => {
    const raw = ordersYearQuery.data?.data ?? [];
    return applyOrderFilters(raw, partsById, filters);
  }, [ordersYearQuery.data, partsById, filters]);

  // ─── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo<ISalesKpis>(() => {
    const currentRevenue = sumBy(ordersCurrent, (o) => matchingRevenue(o, partsById, filters));
    const previousRevenue = sumBy(ordersPrevious, (o) => matchingRevenue(o, partsById, filters));

    const currentCount = ordersCurrent.length;
    const previousCount = ordersPrevious.length;

    const currentAvg = currentCount > 0 ? currentRevenue / currentCount : 0;
    const previousAvg = previousCount > 0 ? previousRevenue / previousCount : 0;

    const currentMargin = sumBy(ordersCurrent, (o) => matchingMargin(o, partsById, filters));
    const previousMargin = sumBy(ordersPrevious, (o) => matchingMargin(o, partsById, filters));

    const currentMarginPct = currentRevenue > 0 ? (currentMargin / currentRevenue) * 100 : 0;
    const previousMarginPct = previousRevenue > 0 ? (previousMargin / previousRevenue) * 100 : 0;

    return {
      revenue: {
        current: currentRevenue,
        previous: previousRevenue,
        trend: computeTrend(currentRevenue, previousRevenue, false),
      },
      orderCount: {
        current: currentCount,
        previous: previousCount,
        trend: computeTrend(currentCount, previousCount, false),
      },
      avgTicket: {
        current: currentAvg,
        previous: previousAvg,
        trend: computeTrend(currentAvg, previousAvg, false),
      },
      marginPct: {
        current: Math.round(currentMarginPct * 10) / 10,
        previous: Math.round(previousMarginPct * 10) / 10,
        trend: computeTrend(currentMarginPct, previousMarginPct, false),
      },
    };
  }, [ordersCurrent, ordersPrevious, partsById, filters]);

  // ─── Monthly revenue (12 months) ────────────────────────────────────────────
  const monthlyRevenue = useMemo<IRevenueMonthlyPoint[]>(() => {
    const buckets = bucketByMonth(ordersYear, (o) => o.paidAt);
    return last12MonthKeys().map((monthKey) => {
      const ordersInMonth = buckets.get(monthKey) ?? [];
      const revenue = sumBy(ordersInMonth, (o) => matchingRevenue(o, partsById, filters));
      return { monthKey, revenue };
    });
  }, [ordersYear, partsById, filters]);

  // ─── Category breakdown ─────────────────────────────────────────────────────
  const categoryBreakdown = useMemo<ICategoryBreakdownItem[]>(() => {
    const totals = new Map<PartCategory | "outros", number>();
    for (const order of ordersCurrent) {
      for (const item of order.items) {
        if (!matchesItemFilters(item, partsById, filters)) continue;
        const cat = partCategory(partsById.get(item.partId));
        totals.set(cat, (totals.get(cat) ?? 0) + item.total);
      }
    }
    const total = [...totals.values()].reduce((acc, v) => acc + v, 0);
    return [...totals.entries()]
      .map(([category, revenue]) => ({
        category,
        revenue,
        share: percentOfTotal(revenue, total),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [ordersCurrent, partsById, filters]);

  // ─── Vehicle brand breakdown ────────────────────────────────────────────────
  const vehicleBrandBreakdown = useMemo<IVehicleBrandBreakdownItem[]>(() => {
    const totals = new Map<string, { revenue: number; orders: Set<ID> }>();
    for (const order of ordersCurrent) {
      for (const item of order.items) {
        if (!matchesItemFilters(item, partsById, filters)) continue;
        const brand = primaryVehicleBrand(partsById.get(item.partId));
        if (!brand) continue;
        const bucket = totals.get(brand) ?? { revenue: 0, orders: new Set<ID>() };
        bucket.revenue += item.total;
        bucket.orders.add(order.id);
        totals.set(brand, bucket);
      }
    }
    return [...totals.entries()]
      .map(([brand, { revenue, orders }]) => ({
        brand,
        revenue,
        orderCount: orders.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [ordersCurrent, partsById, filters]);

  // ─── Channel breakdown ──────────────────────────────────────────────────────
  const channelBreakdown = useMemo<IChannelBreakdownItem[]>(() => {
    const totals = new Map<SalesChannel, number>();
    for (const order of ordersCurrent) {
      const channel = originToChannel(order.origin);
      const value = matchingRevenue(order, partsById, filters);
      totals.set(channel, (totals.get(channel) ?? 0) + value);
    }
    const total = [...totals.values()].reduce((acc, v) => acc + v, 0);
    const allChannels: SalesChannel[] = ["whatsapp", "manual", "portal", "ecommerce"];
    return allChannels
      .map((channel) => {
        const revenue = totals.get(channel) ?? 0;
        return { channel, revenue, share: percentOfTotal(revenue, total) };
      })
      .filter((item) => item.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [ordersCurrent, partsById, filters]);

  // ─── Top products ───────────────────────────────────────────────────────────
  const productAggregates = useMemo(
    () => aggregateProducts(ordersCurrent, partsById, filters),
    [ordersCurrent, partsById, filters],
  );

  const previousProductAggregates = useMemo(
    () => aggregateProducts(ordersPrevious, partsById, filters),
    [ordersPrevious, partsById, filters],
  );

  const topProducts = useMemo<ITopProductRow[]>(() => {
    const total = sumBy([...productAggregates.values()], (v) => v.revenue);
    const rows: ITopProductRow[] = [];
    for (const [partId, agg] of productAggregates) {
      const previousRevenue = previousProductAggregates.get(partId)?.revenue ?? 0;
      rows.push({
        partId,
        sku: agg.sku,
        name: agg.name,
        category: partsById.get(partId)?.category,
        quantity: agg.quantity,
        revenue: agg.revenue,
        share: percentOfTotal(agg.revenue, total),
        previousRevenue,
        trendPctValue: trendPct(agg.revenue, previousRevenue),
      });
    }
    return topN(rows, TOP_N, (row) => row.revenue);
  }, [productAggregates, previousProductAggregates, partsById]);

  const productsInDecline = useMemo<ITopProductRow[]>(() => {
    // Look at all products with previous revenue and detect drops below threshold
    const rows: ITopProductRow[] = [];
    const total = sumBy([...productAggregates.values()], (v) => v.revenue);
    for (const [partId, previousAgg] of previousProductAggregates) {
      const currentAgg = productAggregates.get(partId);
      const currentRevenue = currentAgg?.revenue ?? 0;
      const trend = trendPct(currentRevenue, previousAgg.revenue);
      if (trend === null || trend > DECLINE_THRESHOLD_PCT) continue;
      const part = partsById.get(partId);
      rows.push({
        partId,
        sku: currentAgg?.sku ?? previousAgg.sku,
        name: currentAgg?.name ?? previousAgg.name,
        category: part?.category,
        quantity: currentAgg?.quantity ?? 0,
        revenue: currentRevenue,
        share: percentOfTotal(currentRevenue, total),
        previousRevenue: previousAgg.revenue,
        trendPctValue: trend,
      });
    }
    return rows.sort((a, b) => (a.trendPctValue ?? 0) - (b.trendPctValue ?? 0)).slice(0, 10);
  }, [productAggregates, previousProductAggregates, partsById]);

  // ─── Top customers ──────────────────────────────────────────────────────────
  const topCustomers = useMemo<ITopCustomerRow[]>(() => {
    const byCustomer = groupBy(ordersCurrent, (o) => o.customerId);
    const rows: { customerId: ID; revenue: number; orderCount: number; sellerId: ID }[] = [];
    for (const [customerId, orders] of byCustomer) {
      const revenue = sumBy(orders, (o) => matchingRevenue(o, partsById, filters));
      if (revenue <= 0) continue;
      rows.push({
        customerId,
        revenue,
        orderCount: orders.length,
        sellerId: orders[0].sellerId,
      });
    }
    const abc = classifyABC(rows);
    const inWindow = (iso?: string) =>
      iso !== undefined && iso >= window.fromIso && iso <= window.toIso;

    return topN(rows, TOP_N, (r) => r.revenue).map((r) => {
      const customer = customersById.get(r.customerId);
      return {
        customerId: r.customerId,
        name: customerDisplayName(customer),
        abcClass: abc.get(r.customerId) ?? "C",
        orderCount: r.orderCount,
        revenue: r.revenue,
        avgTicket: r.orderCount > 0 ? r.revenue / r.orderCount : 0,
        sellerId: r.sellerId,
        sellerName: sellerNameById.get(r.sellerId) ?? "—",
        isNew: inWindow(customer?.createdAt),
      };
    });
  }, [ordersCurrent, customersById, sellerNameById, partsById, filters, window]);

  // ─── New vs recurring ───────────────────────────────────────────────────────
  const newVsRecurring = useMemo<INewVsRecurringSnapshot>(() => {
    let newCustomers = 0;
    let recurringCustomers = 0;
    let revenueFromNew = 0;
    let revenueFromRecurring = 0;

    const seen = new Set<ID>();
    for (const order of ordersCurrent) {
      if (seen.has(order.customerId)) continue;
      seen.add(order.customerId);
      const customer = customersById.get(order.customerId);
      const isNew =
        customer !== undefined &&
        customer.createdAt >= window.fromIso &&
        customer.createdAt <= window.toIso;
      if (isNew) newCustomers += 1;
      else recurringCustomers += 1;
    }

    for (const order of ordersCurrent) {
      const customer = customersById.get(order.customerId);
      const value = matchingRevenue(order, partsById, filters);
      const isNew =
        customer !== undefined &&
        customer.createdAt >= window.fromIso &&
        customer.createdAt <= window.toIso;
      if (isNew) revenueFromNew += value;
      else revenueFromRecurring += value;
    }

    const totalRevenue = revenueFromNew + revenueFromRecurring;
    return {
      newCustomers,
      recurringCustomers,
      revenueFromNew,
      revenueFromRecurring,
      newShare: totalRevenue > 0 ? revenueFromNew / totalRevenue : 0,
    };
  }, [ordersCurrent, customersById, partsById, filters, window]);

  // ─── Seasonality (YoY) ──────────────────────────────────────────────────────
  const seasonality = useMemo(
    () => computeSeasonalitySignal(ordersYear, window.toIso),
    [ordersYear, window.toIso],
  );

  // ─── Vehicle brand picker source ────────────────────────────────────────────
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const p of partsById.values()) {
      const b = primaryVehicleBrand(p);
      if (b) brands.add(b);
    }
    return [...brands].sort((a, b) => a.localeCompare(b));
  }, [partsById]);

  return {
    isLoading,
    hasError,
    refetch,
    ordersCurrent,
    ordersPrevious,
    customers: customersQuery.data?.data ?? [],
    parts: partsQuery.data?.data ?? [],
    partsById,
    customersById,
    kpis,
    monthlyRevenue,
    categoryBreakdown,
    vehicleBrandBreakdown,
    channelBreakdown,
    topProducts,
    topCustomers,
    productsInDecline,
    newVsRecurring,
    seasonality,
    availableBrands,
  };
}
