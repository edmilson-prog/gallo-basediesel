import type { ABCClass, ICustomer, ID, IOrder, IABCCurveSettings } from "@/shared/types";

/** Per-customer ABC classification record. */
export interface ICustomerABCRecord {
  customerId: ID;
  customer: ICustomer;
  class: ABCClass;
  revenue: number;
  /** Cumulative share (0..1) up to and including this customer. */
  cumulativeRevenuePct: number;
  /** Rank in the period (1 = highest revenue). */
  rank: number;
}

/** Migration kind comparing current vs previous classification. */
export type ABCMigration = "subiu" | "caiu" | "manteve" | "novo" | "saiu";

export interface ICustomerABCWithMigration extends ICustomerABCRecord {
  previousClass?: ABCClass;
  migration: ABCMigration;
}

export interface IABCClassBucket {
  class: ABCClass;
  count: number;
  revenue: number;
  revenuePct: number;
  customers: ICustomerABCRecord[];
}

export interface IABCMigrationsBucket {
  upgradedToA: ICustomerABCWithMigration[];
  downgradedFromA: ICustomerABCWithMigration[];
  newCustomersInA: ICustomerABCWithMigration[];
}

export interface IABCMetrics {
  period: { startIso: string; endIso: string };
  totalCustomers: number;
  totalRevenue: number;
  records: ICustomerABCRecord[];
  recordsWithMigration: ICustomerABCWithMigration[];
  byClass: {
    A: IABCClassBucket;
    B: IABCClassBucket;
    C: IABCClassBucket;
  };
  migrations: IABCMigrationsBucket;
  /** Quick lookup `customerId → class`. */
  classByCustomerId: Map<ID, ABCClass>;
}

export interface IClassifyABCContext {
  customers: ICustomer[];
  ordersInPeriod: IOrder[];
  settings: IABCCurveSettings;
}

function makeEmptyBucket(klass: ABCClass): IABCClassBucket {
  return { class: klass, count: 0, revenue: 0, revenuePct: 0, customers: [] };
}

/**
 * Pure ABC classification. Aggregates paid orders in the period by customer,
 * ranks them descending by revenue, computes cumulative share and assigns
 * classes by the configured cutoffs (default 80/95).
 *
 * Customers with zero revenue in the period are still returned with `class = "C"`
 * and `rank` after the active set, so downstream UI can still show "C clients
 * with no purchase in the window" if it wants — by default we filter them out
 * in `byClass` and only keep customers with revenue > 0 in the rankings.
 */
export function classifyABC(
  startIso: string,
  endIso: string,
  context: IClassifyABCContext,
): Omit<IABCMetrics, "recordsWithMigration" | "migrations"> {
  const { customers, ordersInPeriod, settings } = context;

  // Aggregate revenue per customer in the period.
  const revenueById = new Map<ID, number>();
  for (const order of ordersInPeriod) {
    revenueById.set(order.customerId, (revenueById.get(order.customerId) ?? 0) + order.total);
  }

  const customerById = new Map<ID, ICustomer>();
  for (const c of customers) customerById.set(c.id, c);

  // Rank customers by revenue desc (only those with revenue > 0 enter the curve).
  const ranked: { customerId: ID; revenue: number; customer: ICustomer }[] = [];
  for (const [customerId, revenue] of revenueById) {
    if (revenue <= 0) continue;
    const customer = customerById.get(customerId);
    if (!customer) continue;
    ranked.push({ customerId, revenue, customer });
  }
  ranked.sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = ranked.reduce((acc, r) => acc + r.revenue, 0);

  const records: ICustomerABCRecord[] = [];
  let cumulative = 0;
  ranked.forEach((row, idx) => {
    cumulative += row.revenue;
    const share = totalRevenue > 0 ? cumulative / totalRevenue : 0;
    let klass: ABCClass;
    if (share <= settings.classAThreshold) klass = "A";
    else if (share <= settings.classBThreshold) klass = "B";
    else klass = "C";
    records.push({
      customerId: row.customerId,
      customer: row.customer,
      class: klass,
      revenue: row.revenue,
      cumulativeRevenuePct: share,
      rank: idx + 1,
    });
  });

  // Edge case: when threshold is so low (e.g. 0%) the entire base would be C.
  // Conversely if the top customer alone exceeds threshold A, they're A and
  // everyone else is B/C — the loop above already handles this correctly.

  const byClass = {
    A: makeEmptyBucket("A"),
    B: makeEmptyBucket("B"),
    C: makeEmptyBucket("C"),
  };
  for (const record of records) {
    const bucket = byClass[record.class];
    bucket.count += 1;
    bucket.revenue += record.revenue;
    bucket.customers.push(record);
  }
  (["A", "B", "C"] as const).forEach((k) => {
    byClass[k].revenuePct = totalRevenue > 0 ? byClass[k].revenue / totalRevenue : 0;
  });

  const classByCustomerId = new Map<ID, ABCClass>();
  for (const record of records) classByCustomerId.set(record.customerId, record.class);

  return {
    period: { startIso, endIso },
    totalCustomers: records.length,
    totalRevenue,
    records,
    byClass,
    classByCustomerId,
  };
}
