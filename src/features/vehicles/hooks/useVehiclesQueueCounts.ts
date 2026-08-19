import { useQueries } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";

export interface IVehiclesQueueScope {
  storeIds: ID[];
  sellerIds: ID[];
  customerId?: ID;
}

export interface IVehiclesQueueCounts {
  pending: number;
  withoutKm: number;
  withoutModel: number;
  isLoading: boolean;
}

/**
 * Sizes the three enrichment queues shown as chips above the list.
 *
 * Deliberately scoped by *access* only (store / seller / customer) and not by
 * the active brand or search filters: the chip is a standing count of work to
 * do, so it must not shift while the user types in the search box. `pageSize:
 * 1` keeps each query to a count — no rows are materialized.
 */
export function useVehiclesQueueCounts(scope: IVehiclesQueueScope): IVehiclesQueueCounts {
  const provider = useVehiclesProvider();
  const base = {
    page: 1,
    pageSize: 1,
    storeIds: scope.storeIds.length > 0 ? scope.storeIds : undefined,
    sellerIds: scope.sellerIds.length > 0 ? scope.sellerIds : undefined,
    customerId: scope.customerId,
  } as const;

  const results = useQueries({
    queries: [
      {
        queryKey: ["vehicles-queue-count", "pending", base] as const,
        queryFn: () => provider.list({ ...base, cadastroStatuses: ["pendente"] }),
        staleTime: 60_000,
      },
      {
        queryKey: ["vehicles-queue-count", "withoutKm", base] as const,
        queryFn: () => provider.list({ ...base, withoutKm: true }),
        staleTime: 60_000,
      },
      {
        queryKey: ["vehicles-queue-count", "withoutModel", base] as const,
        queryFn: () => provider.list({ ...base, withoutModel: true }),
        staleTime: 60_000,
      },
    ],
  });

  return {
    pending: results[0].data?.total ?? 0,
    withoutKm: results[1].data?.total ?? 0,
    withoutModel: results[2].data?.total ?? 0,
    isLoading: results.some((r) => r.isLoading),
  };
}
