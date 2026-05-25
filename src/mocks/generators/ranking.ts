import type { IRanking, IRankingEntry, ISeller, IOrder, IGoal } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { monthRange, monthRef } from "./utils";

/**
 * Monthly individual ranking computed from order revenue + gamification points
 * already encoded on goals (currentValue). The very lightweight scoring keeps
 * the BI screens populated without requiring the full PRD-043 engine.
 */
export function generateRanking(
  sellers: ISeller[],
  orders: IOrder[],
  goals: IGoal[],
  now: Date,
): IRanking {
  const period = monthRef(now);
  const { start, end } = monthRange(now);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const revenueBySeller = new Map<string, number>();
  for (const order of orders) {
    const ts = new Date(order.createdAt).getTime();
    if (ts < startMs || ts > endMs) continue;
    if (order.paymentStatus === "estornado") continue;
    const prev = revenueBySeller.get(order.sellerId) ?? 0;
    revenueBySeller.set(order.sellerId, prev + order.total);
  }

  const ticketBonus = new Map<string, number>();
  for (const goal of goals) {
    if (goal.level !== "individual" || goal.metric !== "tickets") continue;
    ticketBonus.set(goal.targetId, goal.currentValue * 100);
  }

  const entries: IRankingEntry[] = sellers
    .filter((s) => s.id !== "seller-joao-gallo")
    .map((seller) => ({
      sellerId: seller.id,
      score: Math.round((revenueBySeller.get(seller.id) ?? 0) + (ticketBonus.get(seller.id) ?? 0)),
      position: 0,
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry, idx) => ({ ...entry, position: idx + 1 }));

  return {
    id: `ranking-${period}`,
    storeId: SEED_STORE_ID,
    period,
    level: "individual",
    entries,
    generatedAt: now.toISOString(),
  };
}
