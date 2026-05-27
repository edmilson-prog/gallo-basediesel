import { useMemo } from "react";
import type { ID } from "@/shared/types";
import { useGoalsWithProgress } from "./useGoalsWithProgress";

export interface IGoalsStatistics {
  totalActive: number;
  averagePercentage: number;
  heroesCount: number;
  attentionCount: number;
  isLoading: boolean;
}

/**
 * Aggregate KPIs over the currently-active goals in scope. Used by the
 * manager/owner dashboard header.
 */
export function useGoalsStatistics(filters: { storeId?: ID; sellerId?: ID }): IGoalsStatistics {
  const { items, isLoading } = useGoalsWithProgress({
    storeId: filters.storeId,
    sellerId: filters.sellerId,
    statuses: ["ativa"],
  });

  return useMemo<IGoalsStatistics>(() => {
    const totalActive = items.length;
    const averagePercentage =
      items.length > 0
        ? Math.round(items.reduce((acc, i) => acc + i.progress.percentage, 0) / items.length)
        : 0;
    const heroesCount = items.filter((i) => i.progress.percentage >= 100).length;
    const attentionCount = items.filter(
      (i) => i.progress.percentage < 70 && i.progress.status !== "concluida",
    ).length;
    return { totalActive, averagePercentage, heroesCount, attentionCount, isLoading };
  }, [items, isLoading]);
}
