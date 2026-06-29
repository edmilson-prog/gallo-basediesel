import type { ICustomer, ID, IOrder, ISeller } from "@/shared/types";

/**
 * Customer flagged as "at risk" — the days remaining before they cross the
 * configurable lifecycle threshold (`ativo → dormente`).
 */
export interface IAtRiskCustomer {
  customer: ICustomer;
  daysSinceLastOrder: number;
  daysUntilDormant: number;
}

export interface ISellerPositivation {
  sellerId: ID;
  sellerName: string;
  customersInPortfolio: number;
  positivatedCount: number;
  /** 0..1 (multiply by 100 for percent). */
  rate: number;
  /** Linear projection extrapolated by remaining days in the period. */
  projection: number;
  atRiskCount: number;
}

export interface IPositivationPeriod {
  /** Inclusive lower bound (ISO8601). */
  startIso: string;
  /** Inclusive upper bound (ISO8601). */
  endIso: string;
  /** Days already elapsed in the period (>= 1). */
  daysPassed: number;
  /** Total length in days of the period. */
  totalDays: number;
}

export interface IPositivationMetrics {
  period: IPositivationPeriod;
  /** Eligible base: customers with `status === "ativo"` in scope. */
  totalCustomers: number;
  /** Distinct customerId with at least one paid order in the period. */
  positivatedCount: number;
  /** positivatedCount / totalCustomers. */
  positivationRate: number;
  /** Linear projection capped at totalCustomers. */
  projection: number;
  /** projection / totalCustomers (0..1). */
  projectionRate: number;
  /** Breakdown by seller. */
  bySeller: ISellerPositivation[];
  /** Customers in the eligible base that did NOT positivate yet. */
  notPositivated: ICustomer[];
  /** Customers in the eligible base that DID positivate in the period. */
  positivated: ICustomer[];
  /** Full eligible base in scope — superset of `notPositivated` ∪ `positivated`. */
  eligible: ICustomer[];
  /** Active customers within `atRiskWindowDays` of crossing into `dormente`. */
  atRisk: IAtRiskCustomer[];
  /** Set of positivated customer IDs — handy for downstream consumers. */
  positivatedIds: Set<ID>;
}

export interface ICalculatePositivationContext {
  /** All customers in scope (already filtered to store / seller as needed). */
  customers: ICustomer[];
  /** All paid orders in the period (already filtered). */
  ordersInPeriod: IOrder[];
  /** All sellers in scope — used for the by-seller breakdown labels. */
  sellers: ISeller[];
  /** Configurable dormant threshold (`lifecycleThresholds.dormantDays`). */
  dormantDays: number;
  /** "At risk" lookahead window (default 15). */
  atRiskWindowDays?: number;
  /** Clock injection for deterministic tests. */
  now?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY;
  return Math.floor((to.getTime() - from) / MS_PER_DAY);
}

/** Linear projection capped at the eligible base. */
function projectLinear(
  current: number,
  daysPassed: number,
  totalDays: number,
  cap: number,
): number {
  if (daysPassed <= 0 || totalDays <= 0) return current;
  const projected = (current / daysPassed) * totalDays;
  return Math.min(cap, Math.round(projected));
}

export function describePositivationPeriod(
  startIso: string,
  endIso: string,
  now: Date = new Date(),
): IPositivationPeriod {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const totalDays = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) || 1,
  );
  const elapsed = Math.max(
    1,
    Math.min(totalDays, Math.ceil((now.getTime() - startDate.getTime()) / MS_PER_DAY)),
  );
  return { startIso, endIso, totalDays, daysPassed: elapsed };
}

/**
 * Pure positivation metrics computation. Consumed by `usePositivationMetrics`
 * (page + widgets) and exported standalone so the goals engine (PRD-042) and
 * the executive cockpit (PRD-040) can plug it in without duplicating logic.
 */
export function calculatePositivation(
  startIso: string,
  endIso: string,
  context: ICalculatePositivationContext,
): IPositivationMetrics {
  const now = context.now ?? new Date();
  const period = describePositivationPeriod(startIso, endIso, now);
  const atRiskWindow = context.atRiskWindowDays ?? 15;

  // Eligible base = active customers in scope WITH a wallet owner. Dormant/
  // perdido belong to the recovery KPIs (PRD-046); imported pending_review
  // anchors carry no seller_id (not a real wallet customer yet), so they're
  // excluded from BOTH the headline base and the per-seller rollup — keeping
  // `totalCustomers` and the sum of `bySeller` reconciled.
  const eligible = context.customers.filter(
    (c): c is ICustomer & { sellerId: ID } => c.status === "ativo" && c.sellerId !== null,
  );

  // Distinct customer IDs with at least one paid order in the period.
  const positivatedIds = new Set<ID>();
  for (const order of context.ordersInPeriod) {
    positivatedIds.add(order.customerId);
  }

  const positivatedCount = positivatedIds.size;
  const positivationRate = eligible.length > 0 ? positivatedCount / eligible.length : 0;
  const projection = projectLinear(
    positivatedCount,
    period.daysPassed,
    period.totalDays,
    eligible.length,
  );
  const projectionRate = eligible.length > 0 ? projection / eligible.length : 0;

  // Customers in the eligible base that did NOT positivate.
  const notPositivated = eligible.filter((c) => !positivatedIds.has(c.id));
  // Customers in the eligible base that DID positivate.
  const positivated = eligible.filter((c) => positivatedIds.has(c.id));

  // At-risk = active customer whose last order is within `atRiskWindow` of the
  // dormant threshold. We check actual `lastPurchaseAt`, not status — a
  // customer can be flagged as `ativo` but already weeks past the threshold.
  const atRisk: IAtRiskCustomer[] = [];
  for (const customer of eligible) {
    const lastPurchase = customer.lastPurchaseAt;
    if (!lastPurchase) continue;
    const days = daysBetween(lastPurchase, now);
    const daysUntilDormant = context.dormantDays - days;
    if (daysUntilDormant <= atRiskWindow && daysUntilDormant > 0) {
      atRisk.push({
        customer,
        daysSinceLastOrder: days,
        daysUntilDormant,
      });
    }
  }
  atRisk.sort((a, b) => a.daysUntilDormant - b.daysUntilDormant);

  // Seller breakdown — group customers by sellerId, intersect with positivated set.
  const sellerNameById = new Map<ID, string>();
  for (const s of context.sellers) sellerNameById.set(s.id, s.fullName);

  const grouped = new Map<ID, ICustomer[]>();
  for (const customer of eligible) {
    const bucket = grouped.get(customer.sellerId) ?? [];
    bucket.push(customer);
    grouped.set(customer.sellerId, bucket);
  }

  const bySeller: ISellerPositivation[] = [];
  for (const [sellerId, customersOfSeller] of grouped) {
    let positivatedOfSeller = 0;
    let atRiskOfSeller = 0;
    for (const customer of customersOfSeller) {
      if (positivatedIds.has(customer.id)) positivatedOfSeller += 1;
      const last = customer.lastPurchaseAt;
      if (last) {
        const days = daysBetween(last, now);
        const remaining = context.dormantDays - days;
        if (remaining <= atRiskWindow && remaining > 0) atRiskOfSeller += 1;
      }
    }
    const rate = customersOfSeller.length > 0 ? positivatedOfSeller / customersOfSeller.length : 0;
    const sellerProjection = projectLinear(
      positivatedOfSeller,
      period.daysPassed,
      period.totalDays,
      customersOfSeller.length,
    );
    bySeller.push({
      sellerId,
      sellerName: sellerNameById.get(sellerId) ?? "—",
      customersInPortfolio: customersOfSeller.length,
      positivatedCount: positivatedOfSeller,
      rate,
      projection: sellerProjection,
      atRiskCount: atRiskOfSeller,
    });
  }
  bySeller.sort((a, b) => b.rate - a.rate);

  return {
    period,
    totalCustomers: eligible.length,
    positivatedCount,
    positivationRate,
    projection,
    projectionRate,
    bySeller,
    notPositivated,
    positivated,
    eligible,
    atRisk,
    positivatedIds,
  };
}
