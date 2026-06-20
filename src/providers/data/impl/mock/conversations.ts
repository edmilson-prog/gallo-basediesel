import { conversationsApi, customersApi, leadsApi } from "@/mocks";
import type {
  IConversationsProvider,
  ICreateConversationInput,
  ICreateConversationResult,
  ICreateOutboundConversationInput,
} from "../../contracts/conversations";
import type { ID, IConversation, IConversationContact } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { assertImmutableStoreId, scopedListParams, withOwnSellerScope } from "./_storeScope";

export const mockConversationsProvider: IConversationsProvider = {
  list: (params) => {
    const scoped = scopedListParams(params, "conversation");
    const owned = withOwnSellerScope(scoped, "conversation");
    return conversationsApi.list(owned);
  },
  get: (id) => conversationsApi.get(id),
  update: async (id, patch) => {
    const before = await conversationsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return conversationsApi.update(id, patch);
  },
  markRead: (id) => conversationsApi.markRead(id),
  assignSeller: (id, sellerId) => conversationsApi.assignSeller(id, sellerId),
  archive: (id) => conversationsApi.archive(id),
  listContacts: async (conversationIds: ID[]): Promise<IConversationContact[]> => {
    // No RLS in the mock store — resolve the contact for every conversation
    // directly (raw, unscoped apis), mirroring what the supabase RPC exposes for
    // any conversation the caller can access.
    const out: IConversationContact[] = [];
    for (const id of conversationIds) {
      const conv = await conversationsApi.get(id).catch(() => null);
      if (!conv) continue;
      if (conv.customerId) {
        const customer = await customersApi.get(conv.customerId).catch(() => null);
        if (customer) {
          out.push({
            conversationId: id,
            refId: customer.id,
            isLead: false,
            name: customer.type === "B2B" ? customer.nomeFantasia : customer.fullName,
            phone: customer.phone,
            avatarUrl: customer.avatarUrl,
            temperature: null,
          });
          continue;
        }
      }
      if (conv.leadId) {
        const lead = await leadsApi.get(conv.leadId).catch(() => null);
        if (lead) {
          out.push({
            conversationId: id,
            refId: lead.id,
            isLead: true,
            name: lead.name,
            phone: lead.phone,
            temperature: lead.temperature,
          });
        }
      }
    }
    return out;
  },
  create: async (input: ICreateConversationInput): Promise<ICreateConversationResult> => {
    const result = await conversationsApi.create(input);
    auditLog({
      action: "conversation.create",
      resource: "conversation",
      resourceId: result.conversation.id,
      storeId: input.storeId,
      after: {
        channel: input.channel,
        assignedSellerId: result.conversation.assignedSellerId,
        isSdrActive: result.conversation.isSdrActive,
        criterionMatched: result.trace.criterionMatched,
      },
    });
    return result;
  },
  createOutbound: async (input: ICreateOutboundConversationInput): Promise<IConversation> => {
    const conversation = await conversationsApi.createOutbound(input);
    auditLog({
      action: "conversation.create_outbound",
      resource: "conversation",
      resourceId: conversation.id,
      storeId: input.storeId,
      after: {
        whatsappAccountId: input.whatsappAccountId,
        assignedSellerId: input.assignedSellerId,
        customerId: input.customerId,
      },
    });
    return conversation;
  },
};
