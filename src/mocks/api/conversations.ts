import type {
  IConversation,
  ICustomer,
  IDistributionTrace,
  ILead,
  IMessage,
  ID,
} from "@/shared/types";
import {
  selectAllConversations,
  selectAllSellers,
  selectAllStores,
  selectConversationById,
  selectCustomerById,
  selectLeadById,
  selectMessagesByConversation,
} from "../store/selectors";
import { getMockState } from "../store/mockStore";
import { patchById, upsert } from "../store/mutations";
import { distributeConversation, type IDistributionInput } from "@/features/distribution/engine";
import { distributionTracesApi } from "./distributionTraces";
import { settingsApi } from "./settings";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export type ConversationsOrderBy = "lastMessageAt" | "abcClass";

export interface IListConversationsParams extends IPaginationParams {
  storeId?: ID;
  assignedSellerId?: ID;
  status?: IConversation["status"] | IConversation["status"][];
  channel?: IConversation["channel"];
  whatsappAccountId?: ID;
  isSdrActive?: boolean;
  customerId?: ID;
  leadId?: ID;
  tags?: string[];
  search?: string;
  fromDate?: string;
  toDate?: string;
  unassigned?: boolean;
  orderBy?: ConversationsOrderBy;
  orderDir?: "asc" | "desc";
}

function getCustomerOrLead(conversation: IConversation): {
  customer: ICustomer | null;
  lead: ILead | null;
} {
  return {
    customer: conversation.customerId ? selectCustomerById(conversation.customerId) : null,
    lead: conversation.leadId ? selectLeadById(conversation.leadId) : null,
  };
}

function getParticipantNameAndPhone(conversation: IConversation): { name: string; phone: string } {
  const { customer, lead } = getCustomerOrLead(conversation);
  if (customer) {
    const name = customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
    return { name, phone: customer.phone };
  }
  if (lead) {
    return { name: lead.name, phone: lead.phone };
  }
  return { name: "", phone: "" };
}

function matchesSearch(conversation: IConversation, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const { name, phone } = getParticipantNameAndPhone(conversation);
  if (name.toLowerCase().includes(needle)) return true;
  if (phone.toLowerCase().includes(needle)) return true;
  const recent = selectMessagesByConversation(conversation.id)
    .slice(-20)
    .map((m) => m.text.toLowerCase());
  return recent.some((t) => t.includes(needle));
}

function matchesTags(conversation: IConversation, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const { customer, lead } = getCustomerOrLead(conversation);
  const owned = new Set<string>([
    ...conversation.tags,
    ...(customer?.tags ?? []),
    ...(lead?.tags ?? []),
  ]);
  return tags.some((t) => owned.has(t));
}

function abcRank(customerId: ID | undefined): number {
  if (!customerId) return 99;
  const abc = getMockState().abcClassifications.find((c) => c.customerId === customerId);
  if (!abc) return 3;
  if (abc.class === "A") return 0;
  if (abc.class === "B") return 1;
  return 2;
}

export const conversationsApi = {
  list(params: IListConversationsParams = {}): Promise<IPaginatedResult<IConversation>> {
    return runApi(
      "conversationsApi",
      "list",
      () => {
        let all = selectAllConversations();
        if (params.storeId) all = all.filter((c) => c.storeId === params.storeId);
        if (params.assignedSellerId)
          all = all.filter((c) => c.assignedSellerId === params.assignedSellerId);
        if (params.unassigned) all = all.filter((c) => !c.assignedSellerId);
        if (params.status) {
          const allowed = new Set(Array.isArray(params.status) ? params.status : [params.status]);
          all = all.filter((c) => allowed.has(c.status));
        }
        if (params.channel) all = all.filter((c) => c.channel === params.channel);
        if (params.whatsappAccountId)
          all = all.filter((c) => c.whatsappAccountId === params.whatsappAccountId);
        if (typeof params.isSdrActive === "boolean")
          all = all.filter((c) => c.isSdrActive === params.isSdrActive);
        if (params.customerId) all = all.filter((c) => c.customerId === params.customerId);
        if (params.leadId) all = all.filter((c) => c.leadId === params.leadId);
        if (params.fromDate) all = all.filter((c) => c.lastMessageAt >= params.fromDate!);
        if (params.toDate) all = all.filter((c) => c.lastMessageAt <= params.toDate!);
        if (params.tags && params.tags.length > 0)
          all = all.filter((c) => matchesTags(c, params.tags!));
        if (params.search) all = all.filter((c) => matchesSearch(c, params.search!));

        const orderBy = params.orderBy ?? "lastMessageAt";
        const dir = params.orderDir ?? "desc";
        const sign = dir === "asc" ? 1 : -1;
        const sorted = [...all].sort((a, b) => {
          if (orderBy === "abcClass") {
            const ra = abcRank(a.customerId);
            const rb = abcRank(b.customerId);
            if (ra !== rb) return ra - rb;
            return b.lastMessageAt.localeCompare(a.lastMessageAt);
          }
          return sign * a.lastMessageAt.localeCompare(b.lastMessageAt);
        });
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<IConversation> {
    return runApi("conversationsApi", "get", () => {
      const found = selectConversationById(id);
      if (!found) throw new MockNotFoundError("conversation", id);
      return found;
    });
  },

  async update(id: ID, patch: Partial<IConversation>): Promise<IConversation> {
    return runApi("conversationsApi", "update", () => {
      const updated = patchById("conversations", id, patch);
      if (!updated) throw new MockNotFoundError("conversation", id);
      return updated;
    });
  },

  async markRead(id: ID): Promise<IConversation> {
    return runApi("conversationsApi", "markRead", () => {
      const updated = patchById("conversations", id, { unreadCount: 0 });
      if (!updated) throw new MockNotFoundError("conversation", id);
      return updated;
    });
  },

  async assignSeller(id: ID, sellerId: ID): Promise<IConversation> {
    return runApi("conversationsApi", "assignSeller", () => {
      const updated = patchById("conversations", id, {
        assignedSellerId: sellerId,
        isSdrActive: false,
      });
      if (!updated) throw new MockNotFoundError("conversation", id);
      return updated;
    });
  },

  async archive(id: ID): Promise<void> {
    return runApi("conversationsApi", "archive", () => {
      patchById("conversations", id, { status: "arquivada" });
    });
  },

  async createOutbound(input: {
    storeId: ID;
    whatsappAccountId: ID;
    assignedSellerId: ID;
    customerId: ID;
  }): Promise<IConversation> {
    return runApi("conversationsApi", "createOutbound", () => {
      const now = new Date().toISOString();
      const conversation: IConversation = {
        id: `conv-${crypto.randomUUID()}`,
        storeId: input.storeId,
        customerId: input.customerId,
        assignedSellerId: input.assignedSellerId,
        channel: "whatsapp",
        whatsappAccountId: input.whatsappAccountId,
        status: "em_andamento",
        isSdrActive: false,
        tags: [],
        lastMessageAt: now,
        unreadCount: 0,
        createdAt: now,
      };
      upsert("conversations", conversation);
      return conversation;
    });
  },

  async create(input: ICreateInbound): Promise<ICreateInboundResult> {
    return runApi(
      "conversationsApi",
      "create",
      async () => {
        const occurredAt = input.occurredAt ?? new Date().toISOString();
        const store = selectAllStores().find((s) => s.id === input.storeId);
        if (!store) throw new MockNotFoundError("store", input.storeId);
        const settings = store.settings.distribution;
        const sellers = selectAllSellers().filter((s) => s.storeId === input.storeId);

        // Build loadBySeller from currently-open conversations.
        const openStatuses = new Set<IConversation["status"]>([
          "aguardando",
          "em_andamento",
          "aguardando_cliente",
        ]);
        const loadBySeller: Record<ID, number> = {};
        for (const conv of selectAllConversations()) {
          if (!conv.assignedSellerId) continue;
          if (!openStatuses.has(conv.status)) continue;
          loadBySeller[conv.assignedSellerId] = (loadBySeller[conv.assignedSellerId] ?? 0) + 1;
        }

        let participant: IDistributionInput["participant"];
        if (input.customerId) {
          const customer = selectCustomerById(input.customerId);
          if (!customer) throw new MockNotFoundError("customer", input.customerId);
          participant = { kind: "customer", customer };
        } else if (input.leadId) {
          const lead = selectLeadById(input.leadId);
          if (!lead) throw new MockNotFoundError("lead", input.leadId);
          participant = { kind: "lead", lead };
        } else {
          throw new MockNotFoundError("conversation_participant", "missing");
        }

        const conversationId = `conv-new-${crypto.randomUUID().slice(0, 8)}`;
        const decision = distributeConversation(
          {
            conversationId,
            storeId: input.storeId,
            channel: input.channel,
            participant,
            firstMessageText: input.firstMessageText,
            occurredAt,
          },
          { settings, sellers, loadBySeller },
        );

        const conversation: IConversation = {
          id: conversationId,
          storeId: input.storeId,
          customerId: input.customerId,
          leadId: input.leadId,
          assignedSellerId: decision.selectedSellerId ?? undefined,
          channel: input.channel,
          whatsappAccountId: input.whatsappAccountId,
          status: decision.status,
          isSdrActive: decision.isSdrActive,
          tags: [],
          lastMessageAt: occurredAt,
          unreadCount: 1,
          createdAt: occurredAt,
        };
        upsert("conversations", conversation);

        const messages: IMessage[] = [];
        const incomingId = `msg-${crypto.randomUUID()}`;
        const incoming: IMessage = {
          id: incomingId,
          conversationId,
          direction: "in",
          authorType: "customer",
          authorId: input.customerId ?? input.leadId,
          provider: input.channel === "whatsapp" ? "meta" : "mock",
          text: input.firstMessageText,
          status: "delivered",
          sentAt: occurredAt,
          deliveredAt: occurredAt,
        };
        upsert("messages", incoming);
        messages.push(incoming);

        if (decision.systemMessage) {
          const systemId = `msg-${crypto.randomUUID()}`;
          const system: IMessage = {
            id: systemId,
            conversationId,
            direction: "out",
            authorType: "system",
            authorId: "sdr-agent",
            provider: input.channel === "whatsapp" ? "meta" : "mock",
            text: decision.systemMessage,
            status: "sent",
            sentAt: new Date(new Date(occurredAt).getTime() + 1000).toISOString(),
          };
          upsert("messages", system);
          messages.push(system);
        }

        const trace: IDistributionTrace = {
          id: `dist-new-${crypto.randomUUID().slice(0, 8)}`,
          conversationId,
          customerId: input.customerId,
          leadId: input.leadId,
          storeId: input.storeId,
          timestamp: occurredAt,
          selectedSellerId: decision.selectedSellerId,
          criterionMatched: decision.criterionMatched,
          candidatesEvaluated: decision.candidatesEvaluated,
          mode: decision.mode,
        };
        await distributionTracesApi.create(trace);

        // Advance the round-robin cursor when applicable.
        if (decision.criterionMatched === "round_robin" && decision.selectedSellerId) {
          await settingsApi.update(input.storeId, {
            distribution: {
              ...settings,
              lastAssignedSellerId: decision.selectedSellerId,
            },
          });
        }

        return { conversation, messages, trace };
      },
      { payload: { storeId: input.storeId, channel: input.channel } },
    );
  },
};

interface ICreateInbound {
  storeId: ID;
  channel: IConversation["channel"];
  whatsappAccountId?: ID;
  customerId?: ID;
  leadId?: ID;
  firstMessageText: string;
  occurredAt?: string;
}

interface ICreateInboundResult {
  conversation: IConversation;
  messages: IMessage[];
  trace: IDistributionTrace;
}
