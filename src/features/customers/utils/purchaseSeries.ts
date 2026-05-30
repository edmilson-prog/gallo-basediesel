import type { IOrder } from "@/shared/types";

export interface IMonthlyPurchasePoint {
  /** "YYYY-MM" bucket key. */
  month: string;
  /** Short pt-BR label, e.g. "jun". */
  label: string;
  /** Sum of paid order totals in the month (BRL). */
  total: number;
}

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * Aggregate the customer's PAID orders into the last `months` calendar buckets
 * (oldest → newest), filling empty months with 0. Pure function — `now` is
 * injectable for deterministic behavior.
 */
export function buildMonthlyPurchaseSeries(
  orders: IOrder[],
  months = 12,
  now: Date = new Date(),
): IMonthlyPurchasePoint[] {
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }

  for (const order of orders) {
    if (order.paymentStatus !== "pago") continue;
    const d = new Date(order.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + order.total);
    }
  }

  return Array.from(buckets.entries()).map(([month, total]) => {
    const monthIndex = Number(month.slice(5, 7)) - 1;
    return { month, label: MONTH_LABELS[monthIndex] ?? "", total };
  });
}

export function averageOf(points: IMonthlyPurchasePoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + p.total, 0) / points.length;
}
