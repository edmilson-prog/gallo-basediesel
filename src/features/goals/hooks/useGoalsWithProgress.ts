import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { GoalStatus, ID, IGoal, IGoalProgress } from "@/shared/types";
import { useCustomersProvider, useGoalsProvider, useOrdersProvider } from "@/providers/data";
import { calculateGoalProgress } from "../engine/calculate";

export interface IUseGoalsWithProgressParams {
  storeId?: ID;
  /** When set, only goals targeting this seller (`level==="individual"`). */
  sellerId?: ID;
  /** When set, restrict the returned goals to these lifecycle statuses. */
  statuses?: GoalStatus[];
}

export interface IGoalWithProgress {
  goal: IGoal;
  progress: IGoalProgress;
}

export interface IUseGoalsWithProgressResult {
  items: IGoalWithProgress[];
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
}

const STALE_MS = 30_000;

/**
 * Aggregator hook — loads goals + orders + customers in parallel and computes
 * the runtime progress for each goal. The single point where `useQuery` is
 * invoked for goal-related data so consumers don't trigger N+1 fetches.
 */
export function useGoalsWithProgress(
  params: IUseGoalsWithProgressParams = {},
): IUseGoalsWithProgressResult {
  const goalsProvider = useGoalsProvider();
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();

  const queries = useQueries({
    queries: [
      {
        queryKey: ["goals", "list", params.storeId, params.sellerId],
        queryFn: () =>
          goalsProvider.list({
            storeId: params.storeId,
            targetId: params.sellerId,
            pageSize: 500,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["goals", "orders", params.storeId, params.sellerId],
        queryFn: () =>
          ordersProvider.list({
            storeId: params.storeId,
            sellerId: params.sellerId,
            paymentStatus: "pago",
            pageSize: 2000,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["goals", "customers", params.storeId],
        queryFn: () => customersProvider.list({ storeId: params.storeId, pageSize: 2000 }),
        staleTime: STALE_MS,
      },
    ],
  });

  const [goalsQuery, ordersQuery, customersQuery] = queries;
  const isLoading = queries.some((q) => q.isLoading);
  const hasError = queries.some((q) => q.isError);

  const items = useMemo<IGoalWithProgress[]>(() => {
    const goals = goalsQuery.data?.data ?? [];
    const orders = ordersQuery.data?.data ?? [];
    const customers = customersQuery.data?.data ?? [];

    const filtered = goals.filter((goal) => {
      if (params.sellerId) {
        if (goal.level !== "individual") return false;
        if (goal.targetId !== params.sellerId) return false;
      }
      if (params.statuses && params.statuses.length > 0) {
        const status = goal.status ?? "ativa";
        if (!params.statuses.includes(status)) return false;
      }
      return true;
    });

    return filtered.map((goal) => ({
      goal,
      progress: calculateGoalProgress(goal, { orders, customers }),
    }));
  }, [goalsQuery.data, ordersQuery.data, customersQuery.data, params.sellerId, params.statuses]);

  return {
    items,
    isLoading,
    hasError,
    refetch: () => {
      void goalsQuery.refetch();
      void ordersQuery.refetch();
      void customersQuery.refetch();
    },
  };
}
