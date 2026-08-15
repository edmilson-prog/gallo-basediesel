import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IGoal, IGoalProgress } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
} from "@/providers/data";
import { calculateGoalProgress } from "../engine/calculate";

export interface IUseGoalProgressResult {
  goal: IGoal | undefined;
  progress: IGoalProgress | undefined;
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
}

const STALE_MS = 30_000;

/**
 * Hook for a single goal (detail page). Loads the goal first, then orders +
 * customers scoped to its store/seller — minimum data needed for an accurate
 * runtime progress recalc.
 */
export function useGoalProgress(goalId: ID | undefined): IUseGoalProgressResult {
  const goalsProvider = useGoalsProvider();
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();

  const goalsQuery = useQuery({
    queryKey: ["goals", "list", "all"],
    queryFn: () => goalsProvider.list({ pageSize: 500 }),
    staleTime: STALE_MS,
    enabled: Boolean(goalId),
  });

  const goal = goalsQuery.data?.data.find((g) => g.id === goalId);
  // Effective seller scope — shared query key with GoalEvolutionChart /
  // GoalCompositionSection so React Query dedups the identical fetches on the
  // detail page.
  const scopeSellerId = goal?.level === "individual" ? goal.targetId : undefined;

  const ordersQuery = useQuery({
    queryKey: ["goals-scope-orders", goal?.storeId, scopeSellerId],
    queryFn: () =>
      ordersProvider.list({
        storeId: goal?.storeId,
        sellerId: scopeSellerId,
        paymentStatus: "pago",
        pageSize: FETCH_ALL_PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled: Boolean(goal),
  });

  const customersQuery = useQuery({
    queryKey: ["goals-scope-customers", goal?.storeId],
    queryFn: () =>
      customersProvider.list({ storeId: goal?.storeId, pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled: Boolean(goal),
  });

  const progress = useMemo(() => {
    if (!goal) return undefined;
    return calculateGoalProgress(goal, {
      orders: ordersQuery.data?.data ?? [],
      customers: customersQuery.data?.data ?? [],
    });
  }, [goal, ordersQuery.data, customersQuery.data]);

  return {
    goal,
    progress,
    isLoading: goalsQuery.isLoading || ordersQuery.isLoading || customersQuery.isLoading,
    hasError: goalsQuery.isError || ordersQuery.isError || customersQuery.isError,
    refetch: () => {
      void goalsQuery.refetch();
      void ordersQuery.refetch();
      void customersQuery.refetch();
    },
  };
}
