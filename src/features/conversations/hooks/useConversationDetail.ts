import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, IConversation, ILead, ISeller, IWhatsAppAccount } from "@/shared/types";
import {
  useConversationsProvider,
  useCustomersProvider,
  useLeadsProvider,
  useSellersProvider,
  useWhatsAppAccountsProvider,
} from "@/providers/data";

export interface IConversationDetail {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  whatsappAccount: IWhatsAppAccount | null;
  /** Seller the conversation is assigned to (null when unassigned/unreadable). */
  assignedSeller: ISeller | null;
  isLoading: boolean;
  /**
   * True while a previous conversation's cached detail is shown during a switch
   * (`keepPreviousData`) — the new conversation hasn't loaded yet.
   */
  isPlaceholder: boolean;
  notFound: boolean;
  error: Error | null;
  refresh: () => void;
}

/** Shape cached per conversation by the detail query. */
interface IConversationDetailData {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  whatsappAccount: IWhatsAppAccount | null;
  assignedSeller: ISeller | null;
  /** True when the id resolved to a missing row (a soft "not found", not an error). */
  notFound: boolean;
}

const EMPTY_DETAIL: IConversationDetailData = {
  conversation: null,
  customer: null,
  lead: null,
  whatsappAccount: null,
  assignedSeller: null,
  notFound: false,
};

/** Query key for a conversation's detail bundle. */
function conversationDetailKey(conversationId: ID | null): readonly [string, ID | null] {
  return ["conversation-detail", conversationId];
}

/**
 * Loads the selected conversation plus the directly related entities the
 * `<ConversationPage>` header and helpers need: customer/lead participant, the
 * WhatsApp account behind the channel and the assigned seller.
 *
 * Backed by a TanStack `useQuery` keyed by `conversationId` so switching threads
 * stays fluid: a revisited conversation paints its header instantly from cache
 * (and revalidates in the background) instead of re-running the ~5 detail
 * round-trips, and a never-seen one keeps the previous header visible —
 * `keepPreviousData` — rather than flashing the full-page spinner. The flat
 * return shape is unchanged, so consumers stay null-check-friendly and
 * `refresh()` still forces a re-fetch (now via `refetch`).
 */
export function useConversationDetail(conversationId: ID | null): IConversationDetail {
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const whatsappProvider = useWhatsAppAccountsProvider();
  const sellersProvider = useSellersProvider();

  const query = useQuery({
    queryKey: conversationDetailKey(conversationId),
    queryFn: async (): Promise<IConversationDetailData> => {
      const id = conversationId as ID; // guarded by `enabled`
      let conversation: IConversation;
      try {
        conversation = await conversationsProvider.get(id);
      } catch (err) {
        // A missing row is a soft "not found" (renders the empty state); any
        // other failure propagates as `error`. Mirrors the previous catch.
        if (err instanceof Error && /not found/i.test(err.message)) {
          return { ...EMPTY_DETAIL, notFound: true };
        }
        throw err;
      }

      // Related entities load in parallel; each fails soft to null so a missing
      // customer or an RLS-hidden seller never blocks the header.
      const [customer, lead, whatsappAccount, assignedSeller] = await Promise.all([
        conversation.customerId
          ? customersProvider.get(conversation.customerId).catch(() => null)
          : null,
        conversation.leadId ? leadsProvider.get(conversation.leadId).catch(() => null) : null,
        conversation.whatsappAccountId
          ? whatsappProvider.get(conversation.whatsappAccountId).catch(() => null)
          : null,
        conversation.assignedSellerId
          ? sellersProvider.get(conversation.assignedSellerId).catch(() => null)
          : null,
      ]);

      return { conversation, customer, lead, whatsappAccount, assignedSeller, notFound: false };
    },
    enabled: conversationId != null,
    // Keep the previous conversation's header during a switch instead of a
    // spinner-flash; revisited conversations come straight from cache.
    placeholderData: keepPreviousData,
    // Detail entities (status, assignee, lead temperature) can change
    // server-side and every in-app mutation calls refresh() anyway, so keep it
    // always-stale: a revisit revalidates in the background while the cache
    // paints instantly. Matches the old "re-fetch on every open" freshness.
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    // A missing conversation is modeled as `notFound` data, so a thrown error is
    // a genuine failure to surface immediately rather than retry.
    retry: false,
  });

  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // A null id resets to the empty record. Done after the (unconditional) hooks
  // and explicitly, so `keepPreviousData` can't leak the prior conversation's
  // cached detail into the disabled state.
  if (conversationId == null) {
    return { ...EMPTY_DETAIL, isLoading: false, isPlaceholder: false, error: null, refresh };
  }

  const data = query.data;
  return {
    conversation: data?.conversation ?? null,
    customer: data?.customer ?? null,
    lead: data?.lead ?? null,
    whatsappAccount: data?.whatsappAccount ?? null,
    assignedSeller: data?.assignedSeller ?? null,
    isLoading: query.isLoading,
    isPlaceholder: query.isPlaceholderData,
    notFound: data?.notFound ?? false,
    error: query.error,
    refresh,
  };
}
