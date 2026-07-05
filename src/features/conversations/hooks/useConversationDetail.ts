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

interface IConversationDetailData {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  contact: IConversationContact | null;
  whatsappAccount: IWhatsAppAccount | null;
  assignedSeller: ISeller | null;
  /** Collaborators (co-responsáveis) currently on this conversation — never
   *  includes the assignee. Empty on a pool conversation. */
  collaborators: ICollaboratorWithSeller[];
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

function conversationDetailKey(conversationId: ID | null): readonly [string, ID | null] {
  return ["conversation-detail", conversationId];
}

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
      const id = conversationId as ID;
      let conversation: IConversation;
      try {
        conversation = await conversationsProvider.get(id);
      } catch (err) {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return { ...EMPTY_DETAIL, notFound: true };
        }
        throw err;
      }

      const [customer, lead, whatsappAccount, assignedSeller, contacts, participants] =
        await Promise.all([
          conversation.customerId
            ? customersProvider.getViaConversation(id).catch(() => null)
            : null,
          conversation.leadId ? leadsProvider.get(conversation.leadId).catch(() => null) : null,
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
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

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
