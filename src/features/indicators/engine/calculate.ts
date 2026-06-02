import type {
  ID,
  IOrder,
  IOrderItem,
  IPart,
  IProductIndicator,
  IIndicatorProgress,
  IIndicatorContributor,
  IndicatorMetric,
} from "@/shared/types";
import { computeProjection, describePeriodWindow } from "@/features/goals/engine/projection";
import { statusFromRatio, computeWindowedTrend, type IProgressSample } from "@/shared/progress";
import { buildItemMatcher } from "./matcher";

/**
 * Matched value a single order contributes for the given metric, using a
 * prebuilt item matcher. Returns `{matched:false,value:0}` if no item matches.
 * For "pedidos" returns `value:1` when at least one item matches (per-order
 * count). For value metrics, `value` is the sum of matched-item values (may
 * legitimately be 0 even when matched=true).
 */
export function computeOrderContribution(
  order: IOrder,
  metric: IndicatorMetric,
  matches: (item: IOrderItem) => boolean,
): { matched: boolean; value: number } {
  let value = 0;
  let matched = false;
  for (const item of order.items) {
    if (!matches(item)) continue;
    matched = true;
    switch (metric) {
      case "faturamento":
        value += item.total;
        break;
      case "quantidade":
        value += item.quantity;
        break;
      case "margem":
        value += item.marginValue;
        break;
      case "pedidos":
        break;
    }
  }
  if (!matched) return { matched: false, value: 0 };
  return { matched: true, value: metric === "pedidos" ? 1 : value };
}

export interface IIndicatorContext {
  orders: IOrder[];
  /** Catalog used as fallback to resolve item categories when not denormalized. */
  parts?: IPart[];
  /** Reference clock — defaults to `new Date()`; injectable for memo stability. */
  now?: Date;
}

function isWithin(iso: string | undefined, fromIso: string, toIso: string): boolean {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}

function isPaid(order: IOrder): boolean {
  return order.paymentStatus === "pago";
}

function matchesScope(order: IOrder, indicator: IProductIndicator): boolean {
  if (order.storeId !== indicator.storeId) return false;
  if (indicator.scopeLevel === "individual" && order.sellerId !== indicator.sellerId) return false;
  if (indicator.division && order.division !== indicator.division) return false;
  return true;
}

/**
 * Pure function — compute the runtime progress of a product indicator.
 * Aggregates only the order items matching the product selector, within
 * scope + period, for paid orders.
 */
export function calculateIndicatorProgress(
  indicator: IProductIndicator,
  context: IIndicatorContext,
): IIndicatorProgress {
  const now = context.now ?? new Date();
  const fromIso = indicator.period.start;
  const toIso = indicator.period.end;

  const partsMap = new Map<ID, IPart>((context.parts ?? []).map((p) => [p.id, p]));
  const matches = buildItemMatcher(indicator.selector, partsMap);

  let currentValue = 0;
  const bySeller = new Map<ID, number>();
  const samples: IProgressSample[] = [];

  for (const order of context.orders) {
    if (!matchesScope(order, indicator)) continue;
    if (!isPaid(order)) continue;
    const ts = order.paidAt ?? order.createdAt;
    if (!isWithin(ts, fromIso, toIso)) continue;

    const { matched: orderMatched, value: contribution } = computeOrderContribution(
      order,
      indicator.metric,
      matches,
    );

    if (!orderMatched) continue;
    currentValue += contribution;
    bySeller.set(order.sellerId, (bySeller.get(order.sellerId) ?? 0) + contribution);
    samples.push({ ts, value: contribution });
  }

  const window = describePeriodWindow(indicator.period, now);
  const percentage =
    indicator.targetValue > 0
      ? Math.round((currentValue / indicator.targetValue) * 1000) / 10
      : 0;
  const projection = computeProjection(
    currentValue,
    window.daysPassed,
    window.totalDays,
    indicator.targetValue,
  );
  const paceRatio = window.daysRatio > 0 ? percentage / (window.daysRatio * 100) : 1;
  const status = statusFromRatio(percentage, window.daysRatio);
  const trend = computeWindowedTrend(samples, fromIso, now);

  const contributors: IIndicatorContributor[] = [...bySeller.entries()]
    .map(([sellerId, value]) => ({
      sellerId,
      value,
      share: currentValue > 0 ? value / currentValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    indicatorId: indicator.id,
    currentValue,
    percentage,
    projection,
    daysRemaining: window.daysRemaining,
    totalDays: window.totalDays,
    status,
    trend,
    paceRatio,
    contributors,
  };
}
