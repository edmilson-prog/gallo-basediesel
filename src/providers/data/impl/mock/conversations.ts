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
    // The Inbox combined assignment filter (assignmentAny) already expresses the
    // seller scope (it carries "me" → the current seller). Applying
    // withOwnSellerScope on top would AND a scalar assignedSellerId=self and hide
    // pool/queue rows for a non-staff user — diverging from the supabase path,
    // which scopes via RLS (the pool is visible). Skip the own-scope fill then.
    const owned = scoped.assignmentAny
      ? scoped
      : withOwnSellerScope(scoped, "conversation");
    return conversationsApi.list(owned);
  },
  searchMessages: (params) => {
    const scoped = scopedListParams(params, "conversation");
    const owned = scoped.assignmentAny
      ? scoped
      : withOwnSellerScope(scoped, "conversation");
    return conversationsApi.searchMessages(owned);
  },
  get: (id) => conversationsApi.get(id),
  update: async (id, patch) => {
    const before = await conversationsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return conversationsApi.update(id, patch);
  },
  markRead: (id) => conversationsApi.markRead(id),
  assignSeller: (id, sellerId) => conversationsApi.assignSeller(id, sellerId),
  unassign: (id) => conversationsApi.unassign(id),
  archive: (id) => conversationsApi.archive(id),
  listContacts: async (conversationIds: ID[]): Promise<IConversationContact[]> => {
    // No RLS in the mock store — resolve each conversation's contact directly
    // (raw, unscoped apis), mirroring what the supabase RPC exposes for any
    // conversation the caller can access. The lookups are independent, so resolve
    // them concurrently (matches the parallel batch the per-customer path used).
    const resolved = await Promise.all(
      conversationIds.map(async (id): Promise<IConversationContact | null> => {
        const conv = await conversationsApi.get(id).catch(() => null);
        if (!conv) return null;
        if (conv.customerId) {
          const customer = await customersApi.get(conv.customerId).catch(() => null);
          if (customer) {
            return {
              conversationId: id,
              refId: customer.id,
              isLead: false,
              name: customer.type === "B2B" ? customer.nomeFantasia : customer.fullName,
              phone: customer.phone,
              avatarUrl: customer.avatarUrl,
              temperature: null,
            };
          }
        }
        if (conv.leadId) {
          const lead = await leadsApi.get(conv.leadId).catch(() => null);
          if (lead) {
            return {
              conversationId: id,
              refId: lead.id,
              isLead: true,
              name: lead.name,
              phone: lead.phone,
              temperature: lead.temperature,
            };
          }
        }
        return null;
      }),
    );
    return resolved.filter((c): c is IConversationContact => c !== null);
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
