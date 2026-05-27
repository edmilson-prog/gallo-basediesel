import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommissionStatus, ICommission, ID } from "@/shared/types";
import { useCommissionsProvider } from "@/providers/data";

const STALE_MS = 30_000;
const PAGE_SIZE = 1000;

export interface IUseCommissionsListParams {
  storeId: ID;
  period?: string;
  sellerId?: ID;
  sellerIds?: ID[];
  statuses?: CommissionStatus[];
  enabled?: boolean;
}

export interface IUseCommissionsListResult {
  data: ICommission[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Lists commissions for the given store/period/seller. Wrapped in TanStack
 * Query for caching and shared invalidation across the feature.
 */
export function useCommissionsList(params: IUseCommissionsListParams): IUseCommissionsListResult {
  const { storeId, period, sellerId, sellerIds, statuses, enabled = true } = params;
  const provider = useCommissionsProvider();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["commissions", "list", storeId, period, sellerId, sellerIds, statuses],
    queryFn: () =>
      provider.list({
        storeId,
        period,
        sellerId,
        sellerIds,
        statuses,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const data = useMemo(() => query.data?.data ?? [], [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void queryClient.invalidateQueries({ queryKey: ["commissions"] });
    },
  };
}
