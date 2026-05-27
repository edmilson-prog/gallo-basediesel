import type {
  IBadgeDefinition,
  ICustomer,
  IGamificationBadge,
  IGamificationRules,
  IGoal,
  IOrder,
  IRankingEntry,
  ISeller,
  ID,
  ISO8601,
} from "@/shared/types";

/** Period descriptor used by all gamification calculations. */
export interface IGamificationPeriod {
  type: "mensal" | "trimestral" | "anual";
  startIso: ISO8601;
  endIso: ISO8601;
  /** Reference label matching `IGamificationBadge.periodRef` (e.g. "2026-05"). */
  ref: string;
}

/** Context shared by score and badge calculations. Already loaded by the hook layer. */
export interface IGamificationContext {
  rules: IGamificationRules;
  sellers: ISeller[];
  goals: IGoal[];
  paidOrders: IOrder[];
  customers: ICustomer[];
  badges: IGamificationBadge[];
  /** Used by `estrela-ascensao`: prior period entries keyed by sellerId. */
  previousPeriodEntries?: ReadonlyMap<ID, IRankingEntry>;
}

function isInPeriod(iso: ISO8601 | undefined, period: IGamificationPeriod): boolean {
  if (!iso) return false;
  return iso >= period.startIso && iso <= period.endIso;
}

/**
 * Pure score calculation for a single seller within a period. Aggregates points
 * from four sources — goals, customers, orders and badges — without mutating
 * the inputs. The total returned matches `breakdown.fromGoals + …`.
 *
 * @see ../../../docs/prds/PRD-043-ranking-gamificacao.md
 */
export function calculateSellerScore(
  sellerId: ID,
  period: IGamificationPeriod,
  context: IGamificationContext,
): IRankingEntry {
  const { rules, goals, paidOrders, customers, badges } = context;

  // --- Goals ----------------------------------------------------------------
  let pointsFromGoals = 0;
  for (const goal of goals) {
    if (goal.sellerId !== sellerId) continue;
    // Only count goals whose period overlaps with the analysis window.
    if (goal.period.end < period.startIso) continue;
    if (goal.period.start > period.endIso) continue;
    if (goal.status === "concluida") {
      pointsFromGoals += rules.pointsPerGoalCompleted;
      const target = goal.targetValue || 0;
      if (target > 0 && goal.currentValue >= target * 1.2) {
        pointsFromGoals += rules.pointsPerGoalExceeded;
      }
    }
  }

  // --- Customers (positivação, recovery, novos) -----------------------------
  let pointsFromCustomers = 0;
  const positivatedIds = new Set<ID>();
  for (const order of paidOrders) {
    if (order.sellerId !== sellerId) continue;
    if (!isInPeriod(order.createdAt, period)) continue;
    positivatedIds.add(order.customerId);
  }
  pointsFromCustomers += positivatedIds.size * rules.pointsPerPositivation;

  for (const customer of customers) {
    if (customer.sellerId !== sellerId) continue;
    if (isInPeriod(customer.createdAt, period)) {
      pointsFromCustomers += rules.pointsPerNewCustomer;
    }
  }

  // Recovery: customers whose previous purchase was before the period AND who
  // bought inside the period. Heuristic: if customer is in `positivatedIds`
  // and customer.lastPurchaseAt outside this window, they recovered.
  for (const customerId of positivatedIds) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) continue;
    // If the customer has earlier paid orders strictly before the period start
    // AND none between (previousPurchase, periodStart), treat as recovery.
    const earlier = paidOrders
      .filter((o) => o.customerId === customerId && o.createdAt < period.startIso)
      .map((o) => o.createdAt)
      .sort();
    const lastPriorIso = earlier.length > 0 ? earlier[earlier.length - 1] : undefined;
    if (!lastPriorIso) continue; // brand-new customers count as "novo", not recovery
    const gapDays =
      (new Date(period.startIso).getTime() - new Date(lastPriorIso).getTime()) / 86400_000;
    if (gapDays >= 60) {
      pointsFromCustomers += rules.pointsPerRecovery;
    }
  }

  // --- Orders (high-ticket bonuses) -----------------------------------------
  let pointsFromOrders = 0;
  for (const order of paidOrders) {
    if (order.sellerId !== sellerId) continue;
    if (!isInPeriod(order.createdAt, period)) continue;
    if (order.total >= rules.thresholdHighTicket) {
      pointsFromOrders += rules.pointsPerHighTicketOrder;
    }
  }

  // --- Badges (bonus from earned badges in the period) ----------------------
  let pointsFromBadges = 0;
  const badgeSlugs: string[] = [];
  for (const badge of badges) {
    if (badge.sellerId !== sellerId) continue;
    if (badge.periodRef !== period.ref) continue;
    badgeSlugs.push(badge.badgeType);
    pointsFromBadges += badge.bonusPoints ?? 0;
  }

  const total = pointsFromGoals + pointsFromCustomers + pointsFromOrders + pointsFromBadges;
  const previous = context.previousPeriodEntries?.get(sellerId);

  return {
    sellerId,
    score: Math.round(total),
    position: 0, // populated by calculateRanking
    positionPrevious: previous?.position,
    positionDelta: undefined, // populated by calculateRanking
    breakdown: {
      fromGoals: Math.round(pointsFromGoals),
      fromCustomers: Math.round(pointsFromCustomers),
      fromOrders: Math.round(pointsFromOrders),
      fromBadges: Math.round(pointsFromBadges),
    },
    badgeSlugs,
  };
}

/**
 * Rank a list of `IRankingEntry` already produced by `calculateSellerScore`.
 * Tie-breaking: higher `breakdown.fromGoals`, then better `positionPrevious`.
 * Populates `position` and `positionDelta` in-place via a new array.
 */
export function calculateRanking(entries: IRankingEntry[]): IRankingEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ga = a.breakdown?.fromGoals ?? 0;
    const gb = b.breakdown?.fromGoals ?? 0;
    if (gb !== ga) return gb - ga;
    const pa = a.positionPrevious ?? Number.POSITIVE_INFINITY;
    const pb = b.positionPrevious ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });
  return sorted.map((entry, idx) => {
    const position = idx + 1;
    const positionDelta =
      entry.positionPrevious !== undefined ? entry.positionPrevious - position : undefined;
    return { ...entry, position, positionDelta };
  });
}

/** Helper available to other features (e.g. cockpit widget) that need a quick total. */
export function sumBreakdown(entry: IRankingEntry): number {
  const b = entry.breakdown;
  if (!b) return entry.score;
  return b.fromGoals + b.fromCustomers + b.fromOrders + b.fromBadges;
}

/** Locate a definition (with fallback to undefined) for a slug. */
export function findBadgeDefinition(
  slug: string,
  catalog: IBadgeDefinition[],
): IBadgeDefinition | undefined {
  return catalog.find((b) => b.slug === slug);
}
