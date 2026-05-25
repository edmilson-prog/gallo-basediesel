import type { IGamificationBadge, ISeller } from "@/shared/types";
import { monthRef, type ISeededContext } from "./utils";

const BADGE_TYPES = [
  "top_revenue_month",
  "first_sale",
  "recovery_hero",
  "positivation_champion",
  "speed_to_lead",
  "wallet_keeper",
];

/**
 * Generate `count` badges spread across the supplied sellers and the recent
 * months (current + previous two), respecting `IGamificationBadge.periodRef`.
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
  for (let i = 0; i < options.count; i += 1) {
    const seller = ctx.pick(eligible);
    const badgeType = ctx.pick(BADGE_TYPES);
    const periodRef = ctx.pick(periods);
    out.push({
      id: `badge-${String(i + 1).padStart(3, "0")}`,
      sellerId: seller.id,
      badgeType,
      earnedAt: new Date(now.getTime() - ctx.int(0, 60) * 86400_000).toISOString(),
      periodRef,
    });
  }
  return out;
}
