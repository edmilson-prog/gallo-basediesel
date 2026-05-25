import type { IABCClassification, ICustomer, IOrder, ABCClass } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { monthRef } from "./utils";

/**
 * Standard ABC curve: A captures up to 80% of cumulative revenue, B the next
 * 15% and C the long tail (last 5%). Customers with zero revenue are class C.
 */
export function generateABC(
  customers: ICustomer[],
  orders: IOrder[],
  now: Date,
): IABCClassification[] {
  const period = monthRef(now);
  const revenueByCustomer = new Map<string, number>();
  for (const order of orders) {
    if (order.paymentStatus === "estornado") continue;
    const prev = revenueByCustomer.get(order.customerId) ?? 0;
    revenueByCustomer.set(order.customerId, prev + order.total);
  }
  const totalRevenue = Array.from(revenueByCustomer.values()).reduce((acc, v) => acc + v, 0);
  if (totalRevenue <= 0) {
    return customers.map((c) => buildEntry(c.id, period, "C", 0, 0, now));
  }

  const ranked = customers
    .map((c) => ({ id: c.id, revenue: revenueByCustomer.get(c.id) ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  let cumulative = 0;
  return ranked.map(({ id, revenue }) => {
    const share = revenue / totalRevenue;
    cumulative += share;
    const klass: ABCClass = cumulative <= 0.8 ? "A" : cumulative <= 0.95 ? "B" : "C";
    return buildEntry(id, period, klass, share, cumulative, now);
  });
}

function buildEntry(
  customerId: string,
  period: string,
  klass: ABCClass,
  share: number,
  cumulative: number,
  now: Date,
): IABCClassification {
  return {
    id: `abc-${period}-${customerId}`,
    customerId,
    storeId: SEED_STORE_ID,
    period,
    class: klass,
    revenueShare: Number(share.toFixed(6)),
    cumulativeShare: Number(Math.min(1, cumulative).toFixed(6)),
    generatedAt: now.toISOString(),
  };
}
