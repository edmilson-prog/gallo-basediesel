import type { IConversation, ICustomer, ILead, ID } from "@/shared/types";
import {
  selectAllConversations,
  selectConversationById,
  selectCustomerById,
  selectLeadById,
  selectMessagesByConversation,
} from "../store/selectors";
import { getMockState } from "../store/mockStore";
import { patchById } from "../store/mutations";
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
};
