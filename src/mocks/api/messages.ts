import type { ID, IMessage } from "@/shared/types";
import { selectMessagesByConversation } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { getMockState } from "../store/mockStore";
import {
  MockNotFoundError,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
  paginate,
} from "./utils";

export interface IListMessagesParams extends IPaginationParams {
  conversationId: ID;
  orderDir?: "asc" | "desc";
}

export const messagesApi = {
  list(params: IListMessagesParams): Promise<IPaginatedResult<IMessage>> {
    return runApi(
      "messagesApi",
      "list",
      () => {
        const list = selectMessagesByConversation(params.conversationId);
        const sorted = [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
        if (params.orderDir === "desc") sorted.reverse();
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async send(
    conversationId: ID,
    input: Omit<IMessage, "id" | "conversationId" | "sentAt" | "status" | "direction" | "provider">,
  ): Promise<IMessage> {
    return runApi("messagesApi", "send", () => {
      const conversation = getMockState().conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new MockNotFoundError("conversation", conversationId);
      const now = new Date().toISOString();
      const message: IMessage = {
        id: `msg-${crypto.randomUUID()}`,
        conversationId,
        direction: "out",
        provider: conversation.channel === "whatsapp" ? "meta" : "mock",
        status: "sent",
        sentAt: now,
        deliveredAt: now,
        readAt: undefined,
        ...input,
      };
      upsert("messages", message);
      patchById("conversations", conversationId, {
        lastMessageAt: now,
        status: conversation.status === "aguardando" ? "em_andamento" : conversation.status,
      });
      return message;
    });
  },

  async markStatus(messageId: ID, status: IMessage["status"]): Promise<IMessage> {
    return runApi("messagesApi", "markStatus", () => {
      const updated = patchById("messages", messageId, { status });
      if (!updated) throw new MockNotFoundError("message", messageId);
      return updated;
    });
  },

  async simulateIncoming(conversationId: ID, text?: string): Promise<IMessage> {
    return runApi("messagesApi", "simulateIncoming", () => {
      const conversation = getMockState().conversations.find((c) => c.id === conversationId);
      if (!conversation) throw new MockNotFoundError("conversation", conversationId);
      const now = new Date().toISOString();
      const message: IMessage = {
        id: `msg-${crypto.randomUUID()}`,
        conversationId,
        direction: "in",
        authorType: conversation.customerId ? "customer" : "customer",
        authorId: conversation.customerId ?? conversation.leadId,
        provider: conversation.channel === "whatsapp" ? "meta" : "mock",
        text: text ?? "Você ainda tem essa peça em estoque?",
        status: "delivered",
        sentAt: now,
        deliveredAt: now,
        readAt: undefined,
      };
      upsert("messages", message);
      const nextStatus =
        conversation.status === "arquivada" || conversation.status === "resolvida"
          ? conversation.status
          : "aguardando";
      patchById("conversations", conversationId, {
        lastMessageAt: now,
        status: nextStatus,
        unreadCount: conversation.unreadCount + 1,
      });
      return message;
    });
  },
};
