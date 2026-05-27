import type { ID, IOrder, ISO8601 } from "@/shared/types";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the ISO of `now` minus `days`. */
export function isoDaysAgo(now: Date, days: number): ISO8601 {
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

/** Inclusive lower bound (>=) on order paid date — orders without `paidAt` are skipped. */
export function ordersPaidSince(orders: IOrder[], sinceIso: ISO8601): IOrder[] {
  return orders.filter((o) => {
    if (o.paymentStatus !== "pago" && o.paymentStatus !== "parcial") return false;
    const ts = o.paidAt ?? o.updatedAt ?? o.createdAt;
    return ts >= sinceIso;
  });
}

/** Returns paid orders within `[fromIso, toIso)`. */
export function ordersPaidBetween(orders: IOrder[], fromIso: ISO8601, toIso: ISO8601): IOrder[] {
  return orders.filter((o) => {
    if (o.paymentStatus !== "pago" && o.paymentStatus !== "parcial") return false;
    const ts = o.paidAt ?? o.updatedAt ?? o.createdAt;
    return ts >= fromIso && ts < toIso;
  });
}

/** Sums `o.total` of every order in the list. */
export function sumOrdersTotal(orders: IOrder[]): number {
  let total = 0;
  for (const o of orders) total += o.total;
  return total;
}

/** Sums quantity sold per partId across the orders. */
export function quantityByPart(orders: IOrder[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const o of orders) {
    for (const item of o.items) {
      m.set(item.partId, (m.get(item.partId) ?? 0) + item.quantity);
    }
  }
  return m;
}

/** Sums revenue per partId across the orders. */
export function revenueByPart(orders: IOrder[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const o of orders) {
    for (const item of o.items) {
      m.set(item.partId, (m.get(item.partId) ?? 0) + item.total);
    }
  }
  return m;
}

/** Sums margin per partId across the orders (uses `IOrderItem.marginValue`). */
export function marginByPart(orders: IOrder[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const o of orders) {
    for (const item of o.items) {
      m.set(item.partId, (m.get(item.partId) ?? 0) + item.marginValue);
    }
  }
  return m;
}

/** Sums `o.total` per sellerId across the orders. */
export function revenueBySeller(orders: IOrder[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const o of orders) {
    m.set(o.sellerId, (m.get(o.sellerId) ?? 0) + o.total);
  }
  return m;
}

/** Counts orders per sellerId. */
export function countBySeller(orders: IOrder[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const o of orders) {
    m.set(o.sellerId, (m.get(o.sellerId) ?? 0) + 1);
  }
  return m;
}

/**
 * Formats a percentage delta. Positive sign is included to make direction
 * explicit: 0.18 → "+18%", -0.12 → "-12%".
 */
export function formatPercent(delta: number): string {
  const value = Math.round(delta * 1000) / 10;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toString()}%`;
}

/** Formats an absolute fraction as percent (no sign). 0.18 → "18%". */
export function formatPercentAbs(value: number): string {
  return `${Math.round(Math.abs(value) * 1000) / 10}%`;
}

/** Formats a Brazilian Real value in compact form (R$ 1.5k, R$ 1.2M, …). */
export function formatBRLCompact(value: number): string {
  return `R$ ${new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)}`;
}
