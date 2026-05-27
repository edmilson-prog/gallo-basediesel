import type { CustomerStatus, ICustomer, ID, IOrder, ISeller } from "@/shared/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Customer status buckets reused on the page (mirrors `CustomerStatus`). */
export interface IPortfolioByStatus {
  ativo: number;
  dormente: number;
  recuperacao: number;
  perdido: number;
}

/** Transition counts in the analysis period. */
export interface IChurnData {
  /** Window where the transitions were observed. */
  period: { startIso: string; endIso: string };
  /** Customers that crossed `ativo → dormente` (no purchase past `dormantDays`). */
  activeToDormant: number;
  /** Customers that crossed `ativo → perdido` directly (rare — long inactivity). */
  activeToLost: number;
  /** Customers that crossed `dormente → perdido` (`lostDays` reached). */
  dormantToLost: number;
  /** churn out / total active at start (0..1). */
  churnRate: number;
}

/** Recovery counts in the analysis period. */
export interface IRecoveryData {
  period: { startIso: string; endIso: string };
  /** Dormant customers that purchased again in the window. */
  dormantToActive: number;
  /** Lost customers that purchased again in the window. */
  lostToActive: number;
  /** recovered / (dormant + lost at start) (0..1). */
  recoveryRate: number;
}

export interface IAtRiskCustomer {
  customer: ICustomer;
  /** Days remaining before the next lifecycle threshold is crossed. */
  daysRemaining: number;
}

export interface IPortfolioRiskBuckets {
  /** Active customers within `windowDays` of crossing into `dormente`. */
  activeAtRisk: IAtRiskCustomer[];
  /** Dormant customers within `windowDays` of crossing into `perdido`. */
  dormantAtRisk: IAtRiskCustomer[];
}

export interface ISellerPortfolio {
  sellerId: ID;
  sellerName: string;
  portfolioSize: number;
  byStatus: IPortfolioByStatus;
  /** Number of customers that churned out from active in the window. */
  churnCount: number;
  /** Churn rate (0..1) — churnCount / activeAtStart. */
  churnRate: number;
  /** Number of customers recovered in the window. */
  recoveryCount: number;
  /** Recovery rate (0..1) — recoveryCount / (dormant + lost at start). */
  recoveryRate: number;
  /** Composite health score (0..100). */
  healthScore: number;
  /** Active percent in the portfolio (0..1). */
  activePct: number;
  /** Number of customers in any "at-risk" bucket. */
  atRiskCount: number;
}

export interface IPortfolioMetrics {
  period: { startIso: string; endIso: string };
  totalCustomers: number;
  byStatus: IPortfolioByStatus;
  churn: IChurnData;
  recovery: IRecoveryData;
  growth: {
    newCustomers: number;
    netGrowth: number;
  };
  atRisk: IPortfolioRiskBuckets;
  bySeller: ISellerPortfolio[];
}

export interface ICalculatePortfolioContext {
  /** All customers in scope (already filtered to store / seller as needed). */
  customers: ICustomer[];
  /** All paid orders within the analysis window. */
  ordersInPeriod: IOrder[];
  /** Sellers in scope — used to label the by-seller breakdown. */
  sellers: ISeller[];
  /** From IPlatformSettings.lifecycleThresholds.dormantDays. */
  dormantDays: number;
  /** From IPlatformSettings.lifecycleThresholds.lostDays. */
  lostDays: number;
  /** Lookahead window in days for the "at risk" lists. Default 15. */
  atRiskWindowDays?: number;
  /** Clock injection for deterministic tests. */
  now?: Date;
}

function daysBetween(fromIso: string | undefined, to: Date): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY;
  return Math.floor((to.getTime() - from) / MS_PER_DAY);
}

/**
 * Current lifecycle status of a customer — the persisted `customer.status`
 * already encodes the lifecycle rule from PRD-012 (`ativo`, `dormente`,
 * `perdido`, `recuperacao`). Window-relative transitions are computed
 * separately by {@link computeStatusFromTimeline}.
 */
function deriveStatusNow(customer: ICustomer): CustomerStatus {
  return customer.status;
}

/**
 * Status "snapshot" at a reference date used to compute transitions. Unlike
 * {@link deriveStatusNow} (which trusts the persisted flag), this reads from
 * `lastPurchaseAt` and computes lifecycle status purely from days elapsed —
 * required for measuring churn / recovery across a window.
 */
function computeStatusFromTimeline(
  lastPurchaseAt: string | undefined,
  reference: Date,
  dormantDays: number,
  lostDays: number,
  persisted: CustomerStatus,
): CustomerStatus {
  if (!lastPurchaseAt) {
    return persisted === "perdido" ? "perdido" : "ativo";
  }
  const days = daysBetween(lastPurchaseAt, reference);
  if (days <= dormantDays) return "ativo";
  if (days <= lostDays) return "dormente";
  return "perdido";
}

function emptyByStatus(): IPortfolioByStatus {
  return { ativo: 0, dormente: 0, recuperacao: 0, perdido: 0 };
}

/**
 * Composite 0..100 health score for a seller's portfolio.
 *
 * 50% weight on the share of `ativo` customers (proxy for portfolio quality).
 * 25% on recovery rate in the window (rewards reactivation).
 * 25% on the inverse churn rate (penalises losing customers).
 */
export function calculateHealthScore(input: {
  activePct: number;
  recoveryRate: number;
  churnRate: number;
}): number {
  const { activePct, recoveryRate, churnRate } = input;
  const score = activePct * 50 + recoveryRate * 25 + (1 - Math.min(1, churnRate)) * 25;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Coarse qualitative label for the health score. */
export type HealthQualitative = "excelente" | "bom" | "atencao" | "critico";

export function describeHealthScore(score: number): HealthQualitative {
  if (score >= 80) return "excelente";
  if (score >= 60) return "bom";
  if (score >= 40) return "atencao";
  return "critico";
}

interface ITransitionTally {
  activeToDormant: number;
  activeToLost: number;
  dormantToLost: number;
  dormantToActive: number;
  lostToActive: number;
  newCustomers: number;
  activeAtStart: number;
  dormantAtStart: number;
  lostAtStart: number;
}

function tallyTransitions(
  customers: ICustomer[],
  ordersInPeriod: IOrder[],
  startDate: Date,
  endDate: Date,
  dormantDays: number,
  lostDays: number,
): ITransitionTally {
  // Fastest lookup: for each customer in scope we need to know "did they purchase
  // in the window?". We bucket order timestamps by customerId.
  const purchasedInWindow = new Set<ID>();
  for (const order of ordersInPeriod) {
    purchasedInWindow.add(order.customerId);
  }

  const tally: ITransitionTally = {
    activeToDormant: 0,
    activeToLost: 0,
    dormantToLost: 0,
    dormantToActive: 0,
    lostToActive: 0,
    newCustomers: 0,
    activeAtStart: 0,
    dormantAtStart: 0,
    lostAtStart: 0,
  };

  for (const customer of customers) {
    const createdAt = customer.createdAt;
    const isNewInWindow =
      createdAt && new Date(createdAt).getTime() >= startDate.getTime() &&
      new Date(createdAt).getTime() <= endDate.getTime();
    if (isNewInWindow) tally.newCustomers += 1;

    // Status at start of the window (purely from timeline).
    const statusAtStart = computeStatusFromTimeline(
      customer.lastPurchaseAt,
      startDate,
      dormantDays,
      lostDays,
      customer.status,
    );

    if (statusAtStart === "ativo") tally.activeAtStart += 1;
    if (statusAtStart === "dormente") tally.dormantAtStart += 1;
    if (statusAtStart === "perdido") tally.lostAtStart += 1;

    // Status at end of the window — either purchased in window (back to active)
    // or derived from the timeline at endDate.
    const purchased = purchasedInWindow.has(customer.id);
    const statusAtEnd: CustomerStatus = purchased
      ? "ativo"
      : computeStatusFromTimeline(
          customer.lastPurchaseAt,
          endDate,
          dormantDays,
          lostDays,
          customer.status,
        );

    if (statusAtStart === "ativo" && statusAtEnd === "dormente") tally.activeToDormant += 1;
    if (statusAtStart === "ativo" && statusAtEnd === "perdido") tally.activeToLost += 1;
    if (statusAtStart === "dormente" && statusAtEnd === "perdido") tally.dormantToLost += 1;
    if (statusAtStart === "dormente" && statusAtEnd === "ativo") tally.dormantToActive += 1;
    if (statusAtStart === "perdido" && statusAtEnd === "ativo") tally.lostToActive += 1;
  }

  return tally;
}

/**
 * Pure engine for portfolio analytics (PRD-046). Computes status breakdown,
 * churn / recovery transitions in the window, growth, at-risk lists and a
 * per-seller breakdown including a composite health score.
 *
 * Different from PRD-044 (positivation = binary "purchased in current month?")
 * and PRD-045 (ABC = revenue ranking on 12m). Here the perspective is the
 * portfolio health over a configurable window with state transitions.
 */
export function calculatePortfolioMetrics(
  startIso: string,
  endIso: string,
  context: ICalculatePortfolioContext,
): IPortfolioMetrics {
  const now = context.now ?? new Date();
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const atRiskWindow = context.atRiskWindowDays ?? 15;

  const byStatus = emptyByStatus();
  for (const customer of context.customers) {
    const status = deriveStatusNow(customer);
    if (status === "ativo") byStatus.ativo += 1;
    else if (status === "dormente") byStatus.dormente += 1;
    else if (status === "perdido") byStatus.perdido += 1;
    else if (status === "recuperacao") byStatus.recuperacao += 1;
  }

  const tally = tallyTransitions(
    context.customers,
    context.ordersInPeriod,
    startDate,
    endDate,
    context.dormantDays,
    context.lostDays,
  );

  const totalChurnOut = tally.activeToDormant + tally.activeToLost;
  const churnRate = tally.activeAtStart > 0 ? totalChurnOut / tally.activeAtStart : 0;
  const totalRecovered = tally.dormantToActive + tally.lostToActive;
  const inactiveAtStart = tally.dormantAtStart + tally.lostAtStart;
  const recoveryRate = inactiveAtStart > 0 ? totalRecovered / inactiveAtStart : 0;

  const churn: IChurnData = {
    period: { startIso, endIso },
    activeToDormant: tally.activeToDormant,
    activeToLost: tally.activeToLost,
    dormantToLost: tally.dormantToLost,
    churnRate,
  };

  const recovery: IRecoveryData = {
    period: { startIso, endIso },
    dormantToActive: tally.dormantToActive,
    lostToActive: tally.lostToActive,
    recoveryRate,
  };

  // At-risk lists. We look at the *current* state (today) — not the window
  // boundaries — because these are forward-looking and the user wants the list
  // to be actionable now.
  const activeAtRisk: IAtRiskCustomer[] = [];
  const dormantAtRisk: IAtRiskCustomer[] = [];
  for (const customer of context.customers) {
    const last = customer.lastPurchaseAt;
    if (!last) continue;
    const daysSince = daysBetween(last, now);
    const status = customer.status;
    if (status === "ativo") {
      const remaining = context.dormantDays - daysSince;
      if (remaining > 0 && remaining <= atRiskWindow) {
        activeAtRisk.push({ customer, daysRemaining: remaining });
      }
    } else if (status === "dormente") {
      const remaining = context.lostDays - daysSince;
      if (remaining > 0 && remaining <= atRiskWindow) {
        dormantAtRisk.push({ customer, daysRemaining: remaining });
      }
    }
  }
  activeAtRisk.sort((a, b) => a.daysRemaining - b.daysRemaining);
  dormantAtRisk.sort((a, b) => a.daysRemaining - b.daysRemaining);

  // By-seller breakdown — same math restricted to each seller's portfolio.
  const sellerNameById = new Map<ID, string>();
  for (const s of context.sellers) sellerNameById.set(s.id, s.fullName);

  const customersBySeller = new Map<ID, ICustomer[]>();
  for (const customer of context.customers) {
    const bucket = customersBySeller.get(customer.sellerId) ?? [];
    bucket.push(customer);
    customersBySeller.set(customer.sellerId, bucket);
  }

  const ordersBySeller = new Map<ID, IOrder[]>();
  for (const order of context.ordersInPeriod) {
    const bucket = ordersBySeller.get(order.sellerId) ?? [];
    bucket.push(order);
    ordersBySeller.set(order.sellerId, bucket);
  }

  const bySeller: ISellerPortfolio[] = [];
  for (const [sellerId, customersOfSeller] of customersBySeller) {
    const status = emptyByStatus();
    for (const c of customersOfSeller) {
      const cs = deriveStatusNow(c);
      if (cs === "ativo") status.ativo += 1;
      else if (cs === "dormente") status.dormente += 1;
      else if (cs === "perdido") status.perdido += 1;
      else if (cs === "recuperacao") status.recuperacao += 1;
    }

    const sellerOrders = ordersBySeller.get(sellerId) ?? [];
    const sellerTally = tallyTransitions(
      customersOfSeller,
      sellerOrders,
      startDate,
      endDate,
      context.dormantDays,
      context.lostDays,
    );
    const sellerChurnOut = sellerTally.activeToDormant + sellerTally.activeToLost;
    const sellerChurnRate =
      sellerTally.activeAtStart > 0 ? sellerChurnOut / sellerTally.activeAtStart : 0;
    const sellerRecovered = sellerTally.dormantToActive + sellerTally.lostToActive;
    const sellerInactiveStart = sellerTally.dormantAtStart + sellerTally.lostAtStart;
    const sellerRecoveryRate =
      sellerInactiveStart > 0 ? sellerRecovered / sellerInactiveStart : 0;
    const activePct =
      customersOfSeller.length > 0 ? status.ativo / customersOfSeller.length : 0;
    const healthScore = calculateHealthScore({
      activePct,
      recoveryRate: sellerRecoveryRate,
      churnRate: sellerChurnRate,
    });

    let atRiskCount = 0;
    for (const c of customersOfSeller) {
      if (!c.lastPurchaseAt) continue;
      const daysSince = daysBetween(c.lastPurchaseAt, now);
      if (c.status === "ativo") {
        const r = context.dormantDays - daysSince;
        if (r > 0 && r <= atRiskWindow) atRiskCount += 1;
      } else if (c.status === "dormente") {
        const r = context.lostDays - daysSince;
        if (r > 0 && r <= atRiskWindow) atRiskCount += 1;
      }
    }

    bySeller.push({
      sellerId,
      sellerName: sellerNameById.get(sellerId) ?? "—",
      portfolioSize: customersOfSeller.length,
      byStatus: status,
      churnCount: sellerChurnOut,
      churnRate: sellerChurnRate,
      recoveryCount: sellerRecovered,
      recoveryRate: sellerRecoveryRate,
      healthScore,
      activePct,
      atRiskCount,
    });
  }
  bySeller.sort((a, b) => b.healthScore - a.healthScore);

  return {
    period: { startIso, endIso },
    totalCustomers: context.customers.length,
    byStatus,
    churn,
    recovery,
    growth: {
      newCustomers: tally.newCustomers,
      netGrowth: tally.newCustomers - totalChurnOut,
    },
    atRisk: {
      activeAtRisk,
      dormantAtRisk,
    },
    bySeller,
  };
}
