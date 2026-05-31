import { useQuery } from "@tanstack/react-query";
import { useNotificationSlice } from "./_useNotificationSlice";

export interface IUseUnreadCountResult {
  count: number;
  isLoading: boolean;
}

/**
 * Returns the number of unread notifications for the current actor.
 *
 * RBAC scope enforcement (own / store / all) is applied inside the store
 * implementation — this hook passes no recipientId, letting the store resolve
 * the scope from the authenticated context.
 *
 * Query key: `["notifications", "unread"]` — stable so callers can invalidate
 * when a `markRead` or `markAllRead` mutation completes.
 */
export function useUnreadCount(): IUseUnreadCountResult {
  const store = useNotificationSlice("notifications", "useUnreadCount");

  const query = useQuery<number>({
    queryKey: ["notifications", "unread"] as const,
    queryFn: () => store.unreadCount(),
    staleTime: 15_000,
  });

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}
