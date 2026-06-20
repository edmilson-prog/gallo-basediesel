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
 * @param conversationId When the fiche is opened FROM a conversation, the
 *   customer is read gated-once by the CONVERSATION (`getViaConversation`)
 *   instead of the per-carteira customers policy — so a non-staff seller sees
 *   the fiche of a POOL conversation's customer (Portão A) WITHOUT the noisy
 *   direct-get 406, and without widening the global customers policy (which
 *   tripped statement_timeout in #120). Notes are fetched separately
 *   (best-effort: empty when the customer_notes RLS hides them). Omit it on the
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
      // Opened FROM a conversation: read gated-once by the conversation (no 406
      // for a POOL customer), then notes best-effort. Falls through to the
      // direct get only if the conversation path yields nothing.
      if (convId) {
        const viaConv = await provider.getViaConversation(convId).catch(() => null);
        if (viaConv) {
          const notes = await provider.listNotes(id).catch(() => []);
          return { ...viaConv, notes } as ICustomer;
        }
      }
      try {
        return await provider.get(id);
      } catch {
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
