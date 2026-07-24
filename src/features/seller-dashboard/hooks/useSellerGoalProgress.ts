import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IGoal } from "@/shared/types";
import { useGoalsProvider } from "@/providers/data";
import { deriveGoalPace, type IGoalPaceResult } from "../engine/goalPace";

const STALE_MS = 30_000;

export interface IUseSellerGoalProgressResult {
  isLoading: boolean;
  goal: IGoal | null;
  pace: IGoalPaceResult | null;
}

/** The seller's individual `revenue` goal whose period covers today. */
export function useSellerGoalProgress(storeId: ID, sellerId: ID): IUseSellerGoalProgressResult {
  const goalsProvider = useGoalsProvider();

  const goalsQuery = useQuery({
    queryKey: ["seller-dashboard", "goals", storeId, sellerId],
    queryFn: () =>
      goalsProvider.list({ storeId, level: "individual", targetId: sellerId, metric: "revenue" }),
    staleTime: STALE_MS,
    enabled: Boolean(storeId) && Boolean(sellerId),
  });

  const goal = useMemo<IGoal | null>(() => {
    const goals = goalsQuery.data?.data ?? [];
    const nowIso = new Date().toISOString();
    return goals.find((g) => g.period.start <= nowIso && nowIso <= g.period.end) ?? null;
  }, [goalsQuery.data]);

  const pace = useMemo<IGoalPaceResult | null>(() => (goal ? deriveGoalPace(goal) : null), [goal]);

  return { isLoading: goalsQuery.isLoading, goal, pace };
}
