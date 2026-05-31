import { useQuery } from "@tanstack/react-query";
import type { INotification } from "@/shared/types";
import type { IListNotificationsParams, IPaginatedResult } from "../contracts";
import { useNotificationSlice } from "./_useNotificationSlice";

export interface IUseNotificationsResult {
  data: INotification[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetches a paginated list of notifications for the current actor, applying
 * RBAC scope enforcement in the store implementation.
 *
 * Query key: `["notifications", filters]` — stable so callers can invalidate by
 * prefix when a notification is created, marked read, or archived.
 */
export function useNotifications(
  filters?: IListNotificationsParams,
): IUseNotificationsResult {
  const store = useNotificationSlice("notifications", "useNotifications");

  const query = useQuery<IPaginatedResult<INotification>>({
    queryKey: ["notifications", filters] as const,
    queryFn: () => store.list(filters),
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
