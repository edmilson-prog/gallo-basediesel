import { useQuery } from "@tanstack/react-query";
import type { ICommission, ID } from "@/shared/types";
import { useCommissionsProvider } from "@/providers/data";

export interface IUseCommissionForOrderResult {
  isLoading: boolean;
  isError: boolean;
  commissions: ICommission[];
  /** True when at least one commission exists (split → 2 records). */
  hasCommission: boolean;
}

/**
 * Loads the persisted commission(s) for a given order. Returns more than one
 * record when the split policy created a titular + coverage pair.
 */
export function useCommissionForOrder(
  orderId: ID,
  options: { storeId?: ID; enabled?: boolean } = {},
): IUseCommissionForOrderResult {
  const provider = useCommissionsProvider();
  const query = useQuery({
    queryKey: ["commissions", "by-order", orderId, options.storeId],
    queryFn: () => provider.list({ storeId: options.storeId, pageSize: 1000 }),
    enabled: options.enabled !== false,
    staleTime: 30_000,
  });

  const commissions = (query.data?.data ?? []).filter((c) => c.orderId === orderId);
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    commissions,
    hasCommission: commissions.length > 0,
  };
}
