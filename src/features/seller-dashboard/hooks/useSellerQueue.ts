import { useQuery } from "@tanstack/react-query";
import type { IIdleConversationEntry } from "@/shared/types";
import { useConversationsProvider } from "@/providers/data";

const STALE_MS = 15_000;
const MAX_ENTRIES = 5;

export interface IUseSellerQueueResult {
  isLoading: boolean;
  entries: IIdleConversationEntry[];
  total: number;
}

/**
 * Conversations awaiting reply for the signed-in seller (contract:
 * `IConversationsProvider.getIdleSummary()` is scoped server-side to
 * whoever is calling — no sellerId param needed).
 */
export function useSellerQueue(): IUseSellerQueueResult {
  const conversationsProvider = useConversationsProvider();

  const idleQuery = useQuery({
    queryKey: ["seller-dashboard", "idle-summary"],
    queryFn: () => conversationsProvider.getIdleSummary(),
    staleTime: STALE_MS,
  });

  const entries = idleQuery.data?.entries ?? [];
  return {
    isLoading: idleQuery.isLoading,
    entries: entries.slice(0, MAX_ENTRIES),
    total: entries.length,
  };
}
