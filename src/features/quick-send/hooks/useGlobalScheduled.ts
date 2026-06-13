import { useQuery } from "@tanstack/react-query";
import type { IScheduledSendWithContext } from "@/shared/types";
import { getActiveDataSource, useScheduledSendProvider } from "@/providers/data";

export const globalScheduledQueryKey = ["quick-send", "scheduled", "store"] as const;

export interface IUseGlobalScheduledResult {
  items: IScheduledSendWithContext[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Store-wide pending queue for the Owner/Gestor "Todos" tab. `enabled` gates the
 * query so it never runs for sellers. Polls lightly in supabase (server worker
 * owns dispatch) so sent/failed transitions surface without a manual refetch.
 */
export function useGlobalScheduled(enabled: boolean): IUseGlobalScheduledResult {
  const provider = useScheduledSendProvider();
  const query = useQuery({
    queryKey: globalScheduledQueryKey,
    queryFn: () => provider.listStore({ status: ["pending"] }),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled && getActiveDataSource() === "supabase" ? 30_000 : false,
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
