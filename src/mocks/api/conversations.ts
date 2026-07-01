import type {
  IConversation,
  ICustomer,
  IDistributionTrace,
  ILead,
  IMessage,
  ID,
} from "@/shared/types";
import { selectMessageMatch } from "@/features/conversations/engine/messageSearchMatch";
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
import { applyRotationOverride } from "@/features/rotation/engine/applyRotationOverride";
import { distributionTracesApi } from "./distributionTraces";
import { settingsApi } from "./settings";
import { rotationQueuesApi } from "./rotationQueues";
import { rotationParticipantsApi } from "./rotationParticipants";
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
  assignmentAny?: {
    sellerIds?: ID[];
    unassigned?: boolean;
    queue?: boolean;
  };
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

/** Contact identity ONLY (name/phone) — message content has its own dedicated search, see `searchMessages`. */
function matchesSearch(conversation: IConversation, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const { name, phone } = getParticipantNameAndPhone(conversation);
  if (name.toLowerCase().includes(needle)) return true;
  if (phone.toLowerCase().includes(needle)) return true;
  return false;
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

/**
 * OR predicate for the Inbox multi-select assignment filter. A conversation
 * matches when it satisfies ANY provided criterion (specific seller, pool, or
 * queue). An empty/criterion-less object matches nothing — callers must skip the
 * filter entirely in that case (no criteria === "Todas" === no constraint).
 */
export function matchesAssignmentAny(
  conversation: IConversation,
  assignmentAny: { sellerIds?: ID[]; unassigned?: boolean; queue?: boolean },
): boolean {
  const { sellerIds, unassigned, queue } = assignmentAny;
  if (
    sellerIds &&
    conversation.assignedSellerId &&
    sellerIds.includes(conversation.assignedSellerId)
  )
    return true;
  if (unassigned && !conversation.assignedSellerId) return true;
  if (
    queue &&
    !conversation.assignedSellerId &&
    !conversation.isSdrActive &&
    conversation.status === "aguardando"
  )
    return true;
  return false;
}

/** Every Inbox filter EXCEPT the search term itself — shared by `list` and `searchMessages`. */
function applyNonSearchFilters(
  all: IConversation[],
  params: IListConversationsParams,
): IConversation[] {
  let filtered = all;
  if (params.storeId) filtered = filtered.filter((c) => c.storeId === params.storeId);
  if (params.assignedSellerId)
    filtered = filtered.filter((c) => c.assignedSellerId === params.assignedSellerId);
  if (params.unassigned) filtered = filtered.filter((c) => !c.assignedSellerId);
  if (
    params.assignmentAny &&
    (params.assignmentAny.sellerIds?.length ||
      params.assignmentAny.unassigned ||
      params.assignmentAny.queue)
  )
    filtered = filtered.filter((c) => matchesAssignmentAny(c, params.assignmentAny!));
  if (params.status) {
    const allowed = new Set(Array.isArray(params.status) ? params.status : [params.status]);
    filtered = filtered.filter((c) => allowed.has(c.status));
  }
  if (params.channel) filtered = filtered.filter((c) => c.channel === params.channel);
  if (params.whatsappAccountId)
    filtered = filtered.filter((c) => c.whatsappAccountId === params.whatsappAccountId);
  if (typeof params.isSdrActive === "boolean")
    filtered = filtered.filter((c) => c.isSdrActive === params.isSdrActive);
  if (params.customerId) filtered = filtered.filter((c) => c.customerId === params.customerId);
  if (params.leadId) filtered = filtered.filter((c) => c.leadId === params.leadId);
  if (params.fromDate) filtered = filtered.filter((c) => c.lastMessageAt >= params.fromDate!);
  if (params.toDate) filtered = filtered.filter((c) => c.lastMessageAt <= params.toDate!);
  if (params.tags && params.tags.length > 0)
    filtered = filtered.filter((c) => matchesTags(c, params.tags!));
  return filtered;
}

function sortConversations(
  all: IConversation[],
  params: IListConversationsParams,
): IConversation[] {
  const orderBy = params.orderBy ?? "lastMessageAt";
  const dir = params.orderDir ?? "desc";
  const sign = dir === "asc" ? 1 : -1;
  return [...all].sort((a, b) => {
    if (orderBy === "abcClass") {
      const ra = abcRank(a.customerId);
      const rb = abcRank(b.customerId);
      if (ra !== rb) return ra - rb;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    }
    return sign * a.lastMessageAt.localeCompare(b.lastMessageAt);
  });
}

export const conversationsApi = {
  list(params: IListConversationsParams = {}): Promise<IPaginatedResult<IConversation>> {
    return runApi(
      "conversationsApi",
      "list",
      () => {
        let all = applyNonSearchFilters(selectAllConversations(), params);
        if (params.search) all = all.filter((c) => matchesSearch(c, params.search!));
        const sorted = sortConversations(all, params);
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  /** Dedicated search across message text — see `IConversationsProvider.searchMessages`. */
  searchMessages(params: IListConversationsParams = {}): Promise<IPaginatedResult<IConversation>> {
    return runApi(
      "conversationsApi",
      "searchMessages",
      () => {
        const base = applyNonSearchFilters(selectAllConversations(), params);
        const term = params.search ?? "";
        const withMatch = base.reduce<IConversation[]>((acc, c) => {
          const candidates = selectMessagesByConversation(c.id).map((m) => ({
            text: m.text,
            sentAt: m.sentAt,
            direction: m.direction,
          }));
          const matchedMessage = selectMessageMatch(candidates, term);
          if (matchedMessage) acc.push({ ...c, matchedMessage });
          return acc;
        }, []);
        const sorted = sortConversations(withMatch, params);
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

  async unassign(id: ID): Promise<IConversation> {
    return runApi("conversationsApi", "unassign", () => {
      // Spread-merge in patchById sets the field to `undefined`, which the store
      // reads back as "no assignee" (pool) — the mock equivalent of NULL.
      const updated = patchById("conversations", id, {
        assignedSellerId: undefined,
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

        // PRD-213: the rotation queue is the source of the routine revezamento
        // (boundary contract w/ PRD-013). Carteira/especialidade keep upstream
        // precedence; an empty queue keeps the 013 fallback. One assignment per
        // conversation.
        const rotationState = await rotationQueuesApi.getState(input.storeId);
        const sellersById = Object.fromEntries(sellers.map((s) => [s.id, s]));
        const override = applyRotationOverride(
          decision,
          rotationState,
          sellersById,
          new Date(occurredAt),
        );
        const effective = override.decision;
        const rotationPointers = override.pointers;

        const conversation: IConversation = {
          id: conversationId,
          storeId: input.storeId,
          customerId: input.customerId,
          leadId: input.leadId,
          assignedSellerId: effective.selectedSellerId ?? undefined,
          channel: input.channel,
          whatsappAccountId: input.whatsappAccountId,
          status: effective.status,
          isSdrActive: effective.isSdrActive,
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

        if (effective.systemMessage) {
          const systemId = `msg-${crypto.randomUUID()}`;
          const system: IMessage = {
            id: systemId,
            conversationId,
            direction: "out",
            authorType: "system",
            authorId: "sdr-agent",
            provider: input.channel === "whatsapp" ? "meta" : "mock",
            text: effective.systemMessage,
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
          selectedSellerId: effective.selectedSellerId,
          criterionMatched: effective.criterionMatched,
          candidatesEvaluated: effective.candidatesEvaluated,
          mode: effective.mode,
        };
        await distributionTracesApi.create(trace);

        // Advance the rotation pointers when the queue took over; otherwise keep
        // the legacy round-robin cursor advance for non-governed cases.
        if (rotationPointers) {
          await rotationQueuesApi.update(input.storeId, {
            lastAssignedRefId: rotationPointers.topRefId,
          });
          for (const [deptId, memberId] of Object.entries(rotationPointers.memberByDept)) {
            await rotationParticipantsApi.setMemberPointer(rotationState.queue.id, deptId, memberId);
          }
        } else if (effective.criterionMatched === "round_robin" && effective.selectedSellerId) {
          await settingsApi.update(input.storeId, {
            distribution: { ...settings, lastAssignedSellerId: effective.selectedSellerId },
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
