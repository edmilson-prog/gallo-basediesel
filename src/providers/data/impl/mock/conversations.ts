import { conversationsApi, customersApi, leadsApi } from "@/mocks";
import type {
  IConversationsProvider,
  ICreateConversationInput,
  ICreateConversationResult,
  ICreateOutboundConversationInput,
} from "../../contracts/conversations";
import type {
  ID,
  IConversation,
  IConversationContact,
  IIdleConversationEntry,
  IIdleSummary,
} from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { assertImmutableStoreId, scopedListParams, withOwnSellerScope } from "./_storeScope";
import { assertInboxCountParams } from "../conversationCountSupport";
import { businessSecondsBetween } from "@/features/idle-alerts/engine/idleBusinessTime";
import { computeIdleLevel } from "@/features/idle-alerts/engine/idleLevel";
import { DEFAULT_IDLE_ALERTS_SETTINGS } from "@/features/idle-alerts/config/defaults";
import { readCurrentUserSync } from "@/features/auth/guards";

const EMPTY_IDLE_SUMMARY: IIdleSummary = {
  counts: { level1: 0, level2: 0, level3: 0 },
  entries: [],
};

export const mockConversationsProvider: IConversationsProvider = {
  list: (params) => {
    const scoped = scopedListParams(params, "conversation");
    // The Inbox combined assignment filter (assignmentAny) already expresses the
    // seller scope (it carries "me" → the current seller). Applying
    // withOwnSellerScope on top would AND a scalar assignedSellerId=self and hide
    // pool/queue rows for a non-staff user — diverging from the supabase path,
    // which scopes via RLS (the pool is visible). Skip the own-scope fill then.
    const owned = scoped.assignmentAny ? scoped : withOwnSellerScope(scoped, "conversation");
    return conversationsApi.list(owned);
  },
  count: async (params) => {
    // Fail-fast on params the count contract does not support — parity with the
    // supabase impl, so the guard trips at dev time (mock) instead of only in
    // production (supabase).
    assertInboxCountParams(params ?? {});
    // Mock data is in-memory and cheap — reuse list()'s scoping/filtering and
    // read its total instead of duplicating the filter logic here.
    const result = await mockConversationsProvider.list({
      ...(params ?? {}),
      page: 1,
      pageSize: 1,
    });
    return result.total;
  },
  searchMessages: (params) => {
    const scoped = scopedListParams(params, "conversation");
    const owned = scoped.assignmentAny ? scoped : withOwnSellerScope(scoped, "conversation");
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
  close: (id, status) => conversationsApi.close(id, status),
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
  getIdleSummary: async (): Promise<IIdleSummary> => {
    // `getCurrentContext().user` only guarantees `id`/`role` (the auth/profile
    // id, e.g. "mock-vendedor-lucas") — NOT the seller id conversations are
    // assigned to (`assignedSellerId`, e.g. "seller-..."). Read `sellerId`
    // straight from the session mirror (same source `getCurrentContext`
    // feeds — mirrors `getCurrentMockSellerId()` in the mocks/api layer,
    // without reaching into that private module from the provider).
    const sellerId = readCurrentUserSync()?.sellerId;
    if (!sellerId) return EMPTY_IDLE_SUMMARY;
    const raw = await conversationsApi.listAwaitingReply(sellerId);
    const settings = raw.settings.idleAlerts ?? DEFAULT_IDLE_ALERTS_SETTINGS;
    if (!settings.enabled) return EMPTY_IDLE_SUMMARY;
    const now = new Date();
    const entries = raw.items
      .map((item) => {
        const businessSeconds = businessSecondsBetween(
          raw.workSchedule,
          new Date(item.awaitingReplySince),
          now,
        );
        return { ...item, businessSeconds, level: computeIdleLevel(businessSeconds, settings) };
      })
      .filter((e): e is IIdleConversationEntry => e.level > 0)
      .sort((a, b) => b.level - a.level || b.businessSeconds - a.businessSeconds);
    return {
      counts: {
        level1: entries.filter((e) => e.level === 1).length,
        level2: entries.filter((e) => e.level === 2).length,
        level3: entries.filter((e) => e.level === 3).length,
      },
      entries: entries.slice(0, 500),
    };
  },
};
