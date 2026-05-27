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

export interface IListMessagesForAnalyticsParams {
  /** ISO8601 lower bound on `sentAt` (inclusive). */
  since?: string;
  /** ISO8601 upper bound on `sentAt` (inclusive). */
  until?: string;
  /** Restrict to messages belonging to these conversations. */
  conversationIds?: ID[];
}

export const messagesApi = {
  /**
   * Analytics-only bulk read of messages (PRD-051). Returns every message
   * whose conversation is in scope and whose `sentAt` falls inside the
   * requested window. Mock-only — Supabase implementation in Fase 2 should
   * expose an equivalent RPC backed by an indexed query.
   */
  listForAnalytics(params: IListMessagesForAnalyticsParams = {}): Promise<IMessage[]> {
    return runApi(
      "messagesApi",
      "listForAnalytics",
      () => {
        const all = getMockState().messages;
        const allowed = params.conversationIds ? new Set(params.conversationIds) : null;
        let out = all;
        if (allowed) out = out.filter((m) => allowed.has(m.conversationId));
        if (params.since) {
          const s = params.since;
          out = out.filter((m) => m.sentAt >= s);
        }
        if (params.until) {
          const u = params.until;
          out = out.filter((m) => m.sentAt <= u);
        }
        return out;
      },
      { payload: params },
    );
  },

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
