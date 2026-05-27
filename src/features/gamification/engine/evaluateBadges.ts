import type { IGamificationBadge, ID, IRankingEntry } from "@/shared/types";
import type { IGamificationContext, IGamificationPeriod } from "./calculateSellerScore";

interface IEvaluateBadgesInput {
  sellerId: ID;
  period: IGamificationPeriod;
  context: IGamificationContext;
  /** Newly-computed ranking (used by `estrela-ascensao`). */
  rankingForPeriod?: IRankingEntry[];
}

function makeBadge(
  sellerId: ID,
  periodRef: string,
  slug: string,
  context: IGamificationContext,
  index: number,
): IGamificationBadge | undefined {
  const def = context.rules.badges.find((b) => b.slug === slug && b.active);
  if (!def) return undefined;
  return {
    id: `badge-evaluated-${sellerId}-${periodRef}-${slug}-${index}`,
    sellerId,
    badgeType: slug,
    earnedAt: new Date().toISOString(),
    periodRef,
    category: def.category,
    rarity: def.rarity,
    bonusPoints: def.bonusPoints,
  };
}

/**
 * Idempotent badge evaluation — returns only the badges that are newly
 * earned in the period and not already present in `context.badges` for the
 * `(sellerId, slug, periodRef)` triplet.
 *
 * @see ../../../docs/prds/PRD-043-ranking-gamificacao.md
 */
export function evaluateBadgesForSeller(input: IEvaluateBadgesInput): IGamificationBadge[] {
  const { sellerId, period, context, rankingForPeriod } = input;
  const { rules, goals, paidOrders, customers, badges } = context;

  if (!rules.active) return [];

  const earnedSlugs = new Set(
    badges
      .filter((b) => b.sellerId === sellerId && b.periodRef === period.ref)
      .map((b) => b.badgeType),
  );

  const candidates: string[] = [];

  // --- meta-batida: at least one goal completed in the period --------------
  const sellerCompletedGoals = goals.filter(
    (g) =>
      g.sellerId === sellerId &&
      g.status === "concluida" &&
      g.period.end >= period.startIso &&
      g.period.start <= period.endIso,
  );
  if (sellerCompletedGoals.length >= 1) candidates.push("meta-batida");
  if (sellerCompletedGoals.length >= 3) candidates.push("hat-trick");

  // --- veterano: 12 consecutive months with at least one completed goal -----
  // Approximation: require ≥12 distinct months (by goal.period.start month) of
  // completed goals across all data available — cheap upper bound suitable for
  // the mock dataset.
  const monthsHit = new Set<string>();
  for (const g of goals.filter((x) => x.sellerId === sellerId && x.status === "concluida")) {
    monthsHit.add(g.period.start.slice(0, 7));
  }
  if (monthsHit.size >= 12) candidates.push("veterano");

  // --- volume: maratona (10 paid orders within 24h) -------------------------
  const sellerPaidOrdersInPeriod = paidOrders
    .filter(
      (o) =>
        o.sellerId === sellerId && o.createdAt >= period.startIso && o.createdAt <= period.endIso,
    )
    .map((o) => new Date(o.createdAt).getTime())
    .sort((a, b) => a - b);
  for (let i = 0; i + 9 < sellerPaidOrdersInPeriod.length; i += 1) {
    if (sellerPaidOrdersInPeriod[i + 9] - sellerPaidOrdersInPeriod[i] <= 86400_000) {
      candidates.push("maratona");
      break;
    }
  }

  // --- recordista-tri: biggest paid order in the period (any store) ---------
  if (period.type === "trimestral") {
    let maxOrderInPeriod: { sellerId: ID; total: number } | undefined;
    for (const o of paidOrders) {
      if (o.createdAt < period.startIso || o.createdAt > period.endIso) continue;
      if (!maxOrderInPeriod || o.total > maxOrderInPeriod.total) {
        maxOrderInPeriod = { sellerId: o.sellerId, total: o.total };
      }
    }
    if (maxOrderInPeriod && maxOrderInPeriod.sellerId === sellerId) {
      candidates.push("recordista-tri");
    }
  }

  // --- cobertura: positivated ≥80% of the seller's wallet -------------------
  const wallet = customers.filter((c) => c.sellerId === sellerId);
  if (wallet.length > 0) {
    const positivatedIds = new Set<ID>();
    for (const o of paidOrders) {
      if (o.sellerId !== sellerId) continue;
      if (o.createdAt < period.startIso || o.createdAt > period.endIso) continue;
      positivatedIds.add(o.customerId);
    }
    const coverage = positivatedIds.size / wallet.length;
    if (coverage >= 0.8) candidates.push("cobertura");
  }

  // --- resgatador: ≥3 customers recovered after >90 dormant days -----------
  let recoveryCount = 0;
  const positivatedNow = new Set<ID>();
  for (const o of paidOrders) {
    if (o.sellerId !== sellerId) continue;
    if (o.createdAt < period.startIso || o.createdAt > period.endIso) continue;
    positivatedNow.add(o.customerId);
  }
  for (const customerId of positivatedNow) {
    const earlier = paidOrders
      .filter((o) => o.customerId === customerId && o.createdAt < period.startIso)
      .map((o) => o.createdAt)
      .sort();
    if (earlier.length === 0) continue;
    const lastPriorIso = earlier[earlier.length - 1];
    const gapDays =
      (new Date(period.startIso).getTime() - new Date(lastPriorIso).getTime()) / 86400_000;
    if (gapDays >= 90) recoveryCount += 1;
  }
  if (recoveryCount >= 3) candidates.push("resgatador");

  // --- conquistador: 10+ new customers attributed in the period -------------
  const newCustomersCount = customers.filter(
    (c) =>
      c.sellerId === sellerId && c.createdAt >= period.startIso && c.createdAt <= period.endIso,
  ).length;
  if (newCustomersCount >= 10) candidates.push("conquistador");

  // --- big-ticket: ticket médio > thresholdBigTicket ------------------------
  const sellerPaidOrdersInPeriodFull = paidOrders.filter(
    (o) =>
      o.sellerId === sellerId && o.createdAt >= period.startIso && o.createdAt <= period.endIso,
  );
  if (sellerPaidOrdersInPeriodFull.length > 0) {
    const total = sellerPaidOrdersInPeriodFull.reduce((sum, o) => sum + o.total, 0);
    const avg = total / sellerPaidOrdersInPeriodFull.length;
    if (avg >= rules.thresholdBigTicket) candidates.push("big-ticket");
  }

  // --- estrela-ascensao: climbed ≥3 positions in the ranking ----------------
  if (rankingForPeriod) {
    const sellerEntry = rankingForPeriod.find((e) => e.sellerId === sellerId);
    if (sellerEntry && sellerEntry.positionDelta !== undefined && sellerEntry.positionDelta >= 3) {
      candidates.push("estrela-ascensao");
    }
  }

  // --- filter out already-earned and inactive ------------------------------
  const out: IGamificationBadge[] = [];
  let idx = 0;
  for (const slug of candidates) {
    if (earnedSlugs.has(slug)) continue;
    const badge = makeBadge(sellerId, period.ref, slug, context, idx);
    idx += 1;
    if (!badge) continue;
    out.push(badge);
    earnedSlugs.add(slug); // prevent dup within same call
  }
  return out;
}
