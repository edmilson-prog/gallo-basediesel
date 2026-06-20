import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";

/**
 * Stale time of 2 minutes — matches the "cache de 2min" requirement (RNF-003).
 * Reopening the same fiche within the window skips the provider call and
 * renders from cache instantly.
 */
const TWO_MINUTES_MS = 2 * 60 * 1000;

export interface ICustomerProfileQuery {
  customer: ICustomer | null;
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
  refetch: () => void;
}

/**
 * @param conversationId When the fiche is opened FROM a conversation, the read
 *   falls back to the conversation-gated path (`getViaConversation`) if the
 *   direct `get` is RLS-blocked — so a non-staff seller can see the fiche of a
 *   POOL conversation's customer (Portão A) without the global customers policy
 *   being widened (which tripped statement_timeout in #120). Omit it on the
 *   standalone `/app/clientes/:id` route, where only the carteira/staff read
 *   applies.
 */
export function useCustomerProfile(
  customerId: ID | null | undefined,
  conversationId?: ID | null,
): ICustomerProfileQuery {
  const provider = useCustomersProvider();
  const query = useQuery({
    queryKey: ["customer-profile", customerId, conversationId ?? null] as const,
    enabled: Boolean(customerId),
    staleTime: TWO_MINUTES_MS,
    gcTime: TWO_MINUTES_MS,
    retry: 1,
    queryFn: async ({ queryKey }) => {
      const [, id, convId] = queryKey;
      if (!id) return null;
      try {
        return await provider.get(id);
      } catch {
        // Pool customer: the per-carteira customers RLS hides it (406). When the
        // fiche was opened from a conversation, fall back to the
        // conversation-gated read so it still renders; otherwise soft notFound.
        if (convId) {
          return await provider.getViaConversation(convId).catch(() => null);
        }
        return null;
      }
    },
  });

  return {
    customer: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    notFound: !query.isLoading && !query.isError && query.data === null && Boolean(customerId),
    refetch: () => void query.refetch(),
  };
}
