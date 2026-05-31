import { useQuery } from "@tanstack/react-query";
import type { ID, INotification } from "@/shared/types";
import type { IListNotificationsParams, IPaginatedResult } from "../contracts";
import { useNotificationSlice } from "./_useNotificationSlice";
import type { IUseNotificationsResult } from "./useNotifications";

/**
 * Customer-portal notification list. Same shape as useNotifications but keyed by
 * customerId so the storefront account area keeps an isolated cache from the
 * app. On /loja the store resolves the recipient to the customer (see _scope.ts).
 */
export function useCustomerNotifications(
  customerId: ID | undefined,
  filters?: IListNotificationsParams,
): IUseNotificationsResult {
  const store = useNotificationSlice("notifications", "useCustomerNotifications");
  const query = useQuery<IPaginatedResult<INotification>>({
    queryKey: ["notifications", "customer", customerId, filters] as const,
    queryFn: () => store.list(filters),
    enabled: Boolean(customerId),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  return {
    data: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
