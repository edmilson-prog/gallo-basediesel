import { messagesApi } from "@/mocks";
import type { IMessagesProvider } from "../../contracts/messages";

export const mockMessagesProvider: IMessagesProvider = {
  list: (params) => messagesApi.list(params),
  send: (conversationId, input) => messagesApi.send(conversationId, input),
  markStatus: (messageId, status) => messagesApi.markStatus(messageId, status),
  simulateIncoming: (conversationId, text, mediaType) =>
    messagesApi.simulateIncoming(conversationId, text, mediaType),
  listForAnalytics: (params) => messagesApi.listForAnalytics(params),
  getLastInboundAt: async (conversationId) => {
    // Newest-first scan over the mock dataset — first inbound row wins.
    const result = await messagesApi.list({
      conversationId,
      page: 1,
      pageSize: 500,
      orderDir: "desc",
    });
    const inbound = result.data.find((m) => m.direction === "in");
    return inbound?.sentAt ?? null;
  },
};
