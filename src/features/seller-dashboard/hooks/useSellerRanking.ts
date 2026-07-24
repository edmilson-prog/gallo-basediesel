import { useMemo } from "react";
import type { ID, IRankingEntry } from "@/shared/types";
import { useRanking, resolvePeriod } from "@/features/gamification";

export interface IUseSellerRankingResult {
  isLoading: boolean;
  entry: IRankingEntry | null;
  totalSellers: number;
}

/**
 * This seller's own entry in the current month's store ranking.
 * `useRanking` already computes `position`/`positionDelta` per entry
 * (via `calculateRanking`) — no extra engine work needed here.
 */
export function useSellerRanking(storeId: ID, sellerId: ID): IUseSellerRankingResult {
  const period = useMemo(() => resolvePeriod("mensal"), []);
  const ranking = useRanking({ period, scope: { storeId } });

  const entry = useMemo(
    () => ranking.ranking.find((e) => e.sellerId === sellerId) ?? null,
    [ranking.ranking, sellerId],
  );

  return { isLoading: ranking.isLoading, entry, totalSellers: ranking.sellers.length };
}
