import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  ICustomer,
  ID,
  IConversation,
  IConversationContact,
  ILead,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import {
  useConversationsProvider,
  useConversationParticipantsProvider,
  useCustomersProvider,
  useLeadsProvider,
  useSellersProvider,
  useWhatsAppAccountsProvider,
} from "@/providers/data";

/** A collaborator resolved to its full `ISeller`, paired with how they were
 *  added — the pairing `useConversationParticipantsProvider().list()` alone
 *  can't give the UI (it returns `IConversationParticipant`, not `ISeller`). */
export interface ICollaboratorWithSeller {
  seller: ISeller;
  source: "manual" | "mention";
}

/** The conversation plus the directly-related entities, cached per id. */
interface IConversationDetailData {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  /**
   * Display-ready contact resolved server-side (pool-safe). Reliably carries the
   * name/phone/avatar even when `customer`/`lead` are RLS-hidden for a seller
   * handling a POOL conversation — the header falls back to it for the title.
   */
  contact: IConversationContact | null;
  whatsappAccount: IWhatsAppAccount | null;
  /** Seller the conversation is assigned to (null when unassigned/unreadable). */
  assignedSeller: ISeller | null;
  /** Collaborators (co-responsáveis) currently on this conversation — never
   *  includes the assignee. Empty on a pool conversation. */
  collaborators: ICollaboratorWithSeller[];
  /** True when the id resolved to a missing row (a soft "not found", not an error). */
  notFound: boolean;
}

export interface IConversationDetail extends IConversationDetailData {
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

const EMPTY_DETAIL: IConversationDetailData = {
  conversation: null,
  customer: null,
  lead: null,
  contact: null,
  whatsappAccount: null,
  assignedSeller: null,
  collaborators: [],
  notFound: false,
};

/** Query key for a conversation's detail bundle. */
function conversationDetailKey(conversationId: ID | null): readonly [string, ID | null] {
  return ["conversation-detail", conversationId];
}

/**
 * Loads the selected conversation plus the directly related entities the
 * `<ConversationPage>` header and helpers need: customer/lead participant, the
 * WhatsApp account behind the channel, the assigned seller and the current
 * collaborators.
 *
 * Backed by a TanStack `useQuery` keyed by `conversationId` so switching threads
 * stays fluid: a revisited conversation paints its header instantly from cache
 * (and revalidates in the background) instead of re-running the ~6 detail
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
  const participantsProvider = useConversationParticipantsProvider();

  const query = useQuery({
    queryKey: conversationDetailKey(conversationId),
    queryFn: async (): Promise<IConversationDetailData> => {
      const id = conversationId as ID; // guarded by `enabled`
      let conversation: IConversation;
      try {
        conversation = await conversationsProvider.get(id);
      } catch (err) {
        // The mock provider throws a "not found" for a missing row, modeled here
        // as soft notFound DATA. Real backends (supabase) throw an opaque error
        // for a missing/forbidden row, which propagates below; the page renders
        // the same empty state via its `!conversation` guard.
        if (err instanceof Error && /not found/i.test(err.message)) {
          return { ...EMPTY_DETAIL, notFound: true };
        }
        throw err;
      }

      // Related entities load in parallel; each fails soft to null so a missing
      // customer or an RLS-hidden seller never blocks the header. `contact` is the
      // pool-safe display source: it resolves the name even when `customer`/`lead`
      // are RLS-hidden for a seller handling an unassigned conversation.
      const [customer, lead, whatsappAccount, assignedSeller, contacts, participants] =
        await Promise.all([
          // Resolve the customer gated-once by the CONVERSATION (can_access), not by
          // the per-carteira customers RLS: a POOL conversation's customer would
          // otherwise 406 on the direct `get` (noisy console; null customer). This
          // returns the real customer for any conversation the seller can access.
          conversation.customerId
            ? customersProvider.getViaConversation(id).catch(() => null)
            : null,
          // Same gated-once pattern for the lead anchor: the per-owner leads RLS
          // hides an OWNERLESS lead from non-staff, so the direct `get` would
          // fail-soft to null for exactly the attendant operating the pool.
          conversation.leadId ? leadsProvider.getViaConversation(id).catch(() => null) : null,
          conversation.whatsappAccountId
            ? whatsappProvider.get(conversation.whatsappAccountId).catch(() => null)
            : null,
          conversation.assignedSellerId
            ? sellersProvider.get(conversation.assignedSellerId).catch(() => null)
            : null,
          conversationsProvider.listContacts([id]).catch(() => []),
          participantsProvider.list(id).catch(() => []),
        ]);
      const contact = contacts.find((c) => c.conversationId === id) ?? null;

      const collaborators = (
        await Promise.all(
          participants.map(async (p) => {
            const seller = await sellersProvider.get(p.sellerId).catch(() => null);
            return seller ? { seller, source: p.source } : null;
          }),
        )
      ).filter((c): c is ICollaboratorWithSeller => c !== null);

      return {
        conversation,
        customer,
        lead,
        contact,
        whatsappAccount,
        assignedSeller,
        collaborators,
        notFound: false,
      };
    },
    enabled: !!conversationId,
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
    // No retry: a failure (missing/forbidden conversation, or a transient error)
    // surfaces immediately as the empty state, mirroring the old single fetch.
    retry: false,
  });

  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // An empty/null id resets to the empty record. Done after the (unconditional)
  // hooks and explicitly, so `keepPreviousData` can't leak the prior
  // conversation's cached detail into the disabled state.
  if (!conversationId) {
    return { ...EMPTY_DETAIL, isLoading: false, error: null, refresh };
  }

  return {
    ...(query.data ?? EMPTY_DETAIL),
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  };
}
