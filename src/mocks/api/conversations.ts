import type { IConversation, ID } from "@/shared/types";
import { selectAllConversations, selectConversationById } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListConversationsParams extends IPaginationParams {
  storeId?: ID;
  assignedSellerId?: ID;
  status?: IConversation["status"];
  channel?: IConversation["channel"];
  isSdrActive?: boolean;
  customerId?: ID;
  leadId?: ID;
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
        if (params.status) all = all.filter((c) => c.status === params.status);
        if (params.channel) all = all.filter((c) => c.channel === params.channel);
        if (typeof params.isSdrActive === "boolean")
          all = all.filter((c) => c.isSdrActive === params.isSdrActive);
        if (params.customerId) all = all.filter((c) => c.customerId === params.customerId);
        if (params.leadId) all = all.filter((c) => c.leadId === params.leadId);
        const sorted = [...all].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
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
      removeById("conversations", id);
    });
  },
};
