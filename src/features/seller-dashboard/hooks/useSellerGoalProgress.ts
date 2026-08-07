import { useMemo } from "react";
import type { GoalStatus, ID, IGoal, IGoalProgress } from "@/shared/types";
import { useGoalsWithProgress } from "@/features/goals";
import { deriveGoalPace, isGoalPeriodCurrent, type IGoalPaceResult } from "../engine/goalPace";

export interface IUseSellerGoalProgressResult {
  isLoading: boolean;
  hasError: boolean;
  goal: IGoal | null;
  progress: IGoalProgress | null;
  pace: IGoalPaceResult | null;
}

/**
 * The seller's active individual `revenue` goal for the current period.
 *
 * Delegates to `useGoalsWithProgress` — the single aggregator the rest of the
 * goals feature uses — so progress is DERIVED from paid orders via
 * `calculateGoalProgress`. The persisted `goal.currentValue` / `progressPercent`
 * snapshot is never read: it is only written by `useGoalAutoStatusUpdate`, which
 * is a no-op in this project, so reading it would show every seller R$ 0,00
 * against their target while the Metas screen showed the real figure.
 *
 * Delegating also inherits the aggregator's `pageSize: 500` (the goals list is
 * client-filtered, so the provider's 20-row default would silently hide the
 * current month behind a page of future-dated goals) and its shared query keys
 * (dedup with the Metas screens).
 */
export function useSellerGoalProgress(storeId: ID, sellerId: ID): IUseSellerGoalProgressResult {
  // Only `ativa` goals: a cancelled or archived target whose period still
  // covers today must not be presented to the seller as their goal.
  const statuses = useMemo<GoalStatus[]>(() => ["ativa", "concluida"], []);

  const goalsWithProgress = useGoalsWithProgress({
    storeId: storeId || undefined,
    sellerId: sellerId || undefined,
    statuses,
  });

  const current = useMemo(() => {
    const now = new Date();
    return (
      goalsWithProgress.items.find(
        (item) => item.goal.metric === "revenue" && isGoalPeriodCurrent(item.goal, now),
      ) ?? null
    );
  }, [goalsWithProgress.items]);

  const pace = useMemo<IGoalPaceResult | null>(
    () => (current ? deriveGoalPace(current.goal, current.progress.currentValue) : null),
    [current],
  );

  return {
    isLoading: goalsWithProgress.isLoading,
    hasError: goalsWithProgress.hasError,
    goal: current?.goal ?? null,
    progress: current?.progress ?? null,
    pace,
  };
}
