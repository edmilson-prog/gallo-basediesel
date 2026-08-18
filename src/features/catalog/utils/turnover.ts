/**
 * Per-part sales turnover ("giro") for the catalog list.
 *
 * `IPart` carries no sales history, so turnover is derived from paid orders the
 * same way `inventory-analytics` does it — but reduced to the two numbers the
 * list column shows: units sold in the window and the date of the last sale.
 *
 * This is deliberately an opt-in column: computing it costs a full orders
 * window, which is a far heavier fetch than the list itself.
 */

import type { ID, IOrder } from "@/shared/types";

/** Turnover window shown by the list column — the kit's "12m". */
export const TURNOVER_WINDOW_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IPartTurnover {
  /** Units sold inside the window. */
  units: number;
  /** ISO timestamp of the most recent paid sale — may predate the window. */
  lastSaleAt: string | null;
}

/** An order counts towards turnover once it has been paid, even partially. */
export function isPaidOrder(order: Pick<IOrder, "paymentStatus">): boolean {
  return order.paymentStatus === "pago" || order.paymentStatus === "parcial";
}

/** Start of the turnover window, as an ISO timestamp. */
export function turnoverWindowStart(now: Date, days = TURNOVER_WINDOW_DAYS): string {
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

/**
 * Index paid orders by part.
 *
 * Units are only counted inside the window, but `lastSaleAt` tracks the most
 * recent sale regardless — "sold once, two years ago" is a different signal
 * from "never sold", and only the latter justifies deactivating a part.
 */
export function buildTurnoverIndex(orders: IOrder[], sinceMs: number): Map<ID, IPartTurnover> {
  const index = new Map<ID, IPartTurnover>();

  for (const order of orders) {
    if (!isPaidOrder(order)) continue;
    const timestamp = order.paidAt ?? order.updatedAt;
    if (!timestamp) continue;
    const ms = new Date(timestamp).getTime();
    if (Number.isNaN(ms)) continue;

    for (const item of order.items) {
      const bucket = index.get(item.partId) ?? { units: 0, lastSaleAt: null };
      if (ms >= sinceMs) bucket.units += item.quantity;
      if (bucket.lastSaleAt == null || new Date(bucket.lastSaleAt).getTime() < ms) {
        bucket.lastSaleAt = timestamp;
      }
      index.set(item.partId, bucket);
    }
  }

  return index;
}

/**
 * Turnover for one part. Returns `null` when the index itself is absent (the
 * column is off, or the orders are still loading) — callers must distinguish
 * "unknown" from a genuine zero, because zero drives the deactivation hint.
 */
export function turnoverFor(
  index: Map<ID, IPartTurnover> | null | undefined,
  partId: ID,
): IPartTurnover | null {
  if (!index) return null;
  return index.get(partId) ?? { units: 0, lastSaleAt: null };
}
