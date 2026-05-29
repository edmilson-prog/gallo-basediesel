import type { ID, IOrder, IQuote, ISeller } from "@/shared/types";
import type { TrendDirection } from "@/features/manager-dashboard/utils/kpiMath";
import { computeTrend } from "@/features/manager-dashboard/utils/kpiMath";

/** Metric the leaderboard is sorted by (and shown as primary value). */
export type SellerRankMetric = "revenue" | "attainmentPct" | "orderCount" | "avgTicket";

/** Visual band for goal attainment (drives token color + redundant icon). */
export type AttainmentBand = "below" | "warning" | "success" | "none";

export interface ISellerLeaderboardRow {
  rank: number;
  sellerId: ID;
  sellerName: string;
  revenue: number;
  orderCount: number;
  avgTicket: number;
  /** Monthly individual revenue target, or null when none. */
  target: number | null;
  /** realized / target * 100; null when no target. */
  attainmentPct: number | null;
  /** Run-rate projection for month end. */
  projection: number;
  /** projection / target * 100; null when no target. */
  attainmentForecastPct: number | null;
  trend: TrendDirection;
  /** Percent change vs previous month (sign preserved); null when not comparable. */
  trendPct: number | null;
  /** Distinct customers assigned to this seller (carteira). */
  customerCount: number;
  /** Distinct customers with a paid order this month (positivados). */
  positivedCustomers: number;
  /** Count of open quotes (status "enviado"). */
  quoteCount: number;
  /** Sum of open quotes' total. */
  openQuotesValue: number;
  /** Cumulative paid revenue per day-of-month, null after today (sparkline/chart). */
  dailySeries: (number | null)[];
}

export interface ISellerLeaderboardSummary {
  sellerCount: number;
  totalRevenue: number;
  /** Average attainment across sellers that have a target; null when none. */
  avgAttainmentPct: number | null;
}

export interface IBuildSellerLeaderboardInput {
  referenceDate: Date;
  sellers: ISeller[];
  /** Paid orders of the current month (whole month range). */
  currentMonthOrders: IOrder[];
  /** Paid orders of the previous month (for trend). */
  previousMonthOrders: IOrder[];
  /** Open quotes (already filtered to status "enviado"). */
  openQuotes: IQuote[];
  /** sellerId -> count of customers in this seller's wallet. */
  customerCountBySeller: Map<ID, number>;
  /** sellerId -> monthly revenue target; absent when no goal. */
  targetBySeller: Map<ID, number>;
}

export interface IBuildSellerLeaderboardResult {
  rows: ISellerLeaderboardRow[];
  summary: ISellerLeaderboardSummary;
  daysInMonth: number;
}

/** Classify an attainment percentage into a visual band. */
export function attainmentBand(attainmentPct: number | null): AttainmentBand {
  if (attainmentPct == null) return "none";
  if (attainmentPct >= 100) return "success";
  if (attainmentPct >= 70) return "warning";
  return "below";
}

/** The comparable numeric value for the active ranking metric. */
export function rankMetricValue(row: ISellerLeaderboardRow, metric: SellerRankMetric): number {
  switch (metric) {
    case "revenue":
      return row.revenue;
    case "attainmentPct":
      return row.attainmentPct ?? -1;
    case "orderCount":
      return row.orderCount;
    case "avgTicket":
      return row.avgTicket;
    default:
      return row.revenue;
  }
}

// Callers pass only paid orders; fall back to createdAt when paidAt is missing (data hygiene).
const dayOf = (o: IOrder): number => new Date(o.paidAt ?? o.createdAt).getDate();

/** Build per-seller aggregated rows + summary, sorted by `metric`, ranks assigned. */
export function buildSellerLeaderboard(
  input: IBuildSellerLeaderboardInput,
  metric: SellerRankMetric,
): IBuildSellerLeaderboardResult {
  const {
    referenceDate,
    sellers,
    currentMonthOrders,
    previousMonthOrders,
    openQuotes,
    customerCountBySeller,
    targetBySeller,
  } = input;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);

  // Per-seller accumulators for the current month.
  const revenue = new Map<ID, number>();
  const orderCount = new Map<ID, number>();
  const perDay = new Map<ID, Map<number, number>>();
  const buyers = new Map<ID, Set<ID>>();
  for (const o of currentMonthOrders) {
    if (o.paymentStatus !== "pago") continue;
    revenue.set(o.sellerId, (revenue.get(o.sellerId) ?? 0) + o.total);
    orderCount.set(o.sellerId, (orderCount.get(o.sellerId) ?? 0) + 1);
    const dmap = perDay.get(o.sellerId) ?? new Map<number, number>();
    const d = dayOf(o);
    dmap.set(d, (dmap.get(d) ?? 0) + o.total);
    perDay.set(o.sellerId, dmap);
    const set = buyers.get(o.sellerId) ?? new Set<ID>();
    set.add(o.customerId);
    buyers.set(o.sellerId, set);
  }

  const prevRevenue = new Map<ID, number>();
  for (const o of previousMonthOrders) {
    if (o.paymentStatus !== "pago") continue;
    prevRevenue.set(o.sellerId, (prevRevenue.get(o.sellerId) ?? 0) + o.total);
  }

  const openCount = new Map<ID, number>();
  const openValue = new Map<ID, number>();
  for (const q of openQuotes) {
    openCount.set(q.sellerId, (openCount.get(q.sellerId) ?? 0) + 1);
    openValue.set(q.sellerId, (openValue.get(q.sellerId) ?? 0) + q.total);
  }

  const cumulativeSeries = (dmap: Map<number, number> | undefined): (number | null)[] => {
    const out: (number | null)[] = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      acc += dmap?.get(d) ?? 0;
      out.push(d <= today ? acc : null);
    }
    return out;
  };

  const rows: ISellerLeaderboardRow[] = sellers.map((seller) => {
    const rev = revenue.get(seller.id) ?? 0;
    const oc = orderCount.get(seller.id) ?? 0;
    const target = targetBySeller.get(seller.id) ?? null;
    const runRate = rev / today; // today is clamped to >= 1 above
    const projection = Math.round(runRate * daysInMonth);
    const trendInfo = computeTrend(rev, prevRevenue.get(seller.id) ?? 0, false);
    return {
      rank: 0,
      sellerId: seller.id,
      sellerName: seller.fullName,
      revenue: rev,
      orderCount: oc,
      avgTicket: oc > 0 ? rev / oc : 0,
      target,
      attainmentPct: target !== null && target > 0 ? (rev / target) * 100 : null,
      projection,
      attainmentForecastPct: target !== null && target > 0 ? (projection / target) * 100 : null,
      trend: trendInfo.direction,
      trendPct: trendInfo.changePct,
      customerCount: customerCountBySeller.get(seller.id) ?? 0,
      positivedCustomers: buyers.get(seller.id)?.size ?? 0,
      quoteCount: openCount.get(seller.id) ?? 0,
      openQuotesValue: openValue.get(seller.id) ?? 0,
      dailySeries: cumulativeSeries(perDay.get(seller.id)),
    };
  });

  rows.sort((a, b) => rankMetricValue(b, metric) - rankMetricValue(a, metric));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const withTarget = rows.filter((r) => r.attainmentPct != null);
  const summary: ISellerLeaderboardSummary = {
    sellerCount: rows.length,
    totalRevenue: rows.reduce((acc, r) => acc + r.revenue, 0),
    avgAttainmentPct:
      withTarget.length > 0
        ? withTarget.reduce((acc, r) => acc + (r.attainmentPct ?? 0), 0) / withTarget.length
        : null,
  };

  return { rows, summary, daysInMonth };
}
