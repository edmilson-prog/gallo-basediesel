import type { IGamificationBadge, ISeller } from "@/shared/types";
import { DEFAULT_BADGE_CATALOG } from "@/features/gamification/catalog/badgeCatalog";
import { monthRef, type ISeededContext } from "./utils";

/**
 * Generate `count` badges spread across the supplied sellers and the recent
 * months (current + previous two), respecting `IGamificationBadge.periodRef`.
 *
 * Uses the canonical PRD-043 badge catalog so each generated badge carries
 * its category, rarity and bonus-points snapshot.
 */
export function generateBadges(
  ctx: ISeededContext,
  options: { count: number; sellers: ISeller[]; now?: Date },
): IGamificationBadge[] {
  const now = options.now ?? new Date();
  const periods: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    periods.push(monthRef(d));
  }
  const out: IGamificationBadge[] = [];
  const eligible = options.sellers.filter((s) => s.id !== "seller-joao-gallo");
  if (eligible.length === 0) return out;
  const activeCatalog = DEFAULT_BADGE_CATALOG.filter((b) => b.active);
  // Track badges already issued for (seller, slug, period) so the same badge
  // is not duplicated — keeps the engine's idempotency assumption truthful.
  const seen = new Set<string>();
  let attempts = 0;
  while (out.length < options.count && attempts < options.count * 5) {
    attempts += 1;
    const seller = ctx.pick(eligible);
    const definition = ctx.pick(activeCatalog);
    const periodRef = ctx.pick(periods);
    const key = `${seller.id}|${definition.slug}|${periodRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `badge-${String(out.length + 1).padStart(3, "0")}`,
      sellerId: seller.id,
      badgeType: definition.slug,
      earnedAt: new Date(now.getTime() - ctx.int(0, 60) * 86400_000).toISOString(),
      periodRef,
      category: definition.category,
      rarity: definition.rarity,
      bonusPoints: definition.bonusPoints,
    });
  }
  return out;
}
