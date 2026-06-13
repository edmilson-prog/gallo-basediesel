import { messagesApi } from "@/mocks";
import type { IMessagesProvider } from "../../contracts/messages";
import { classifyMediaRef } from "@/shared/utils/mediaRef";

export const mockMessagesProvider: IMessagesProvider = {
  list: async (params) => {
    const result = await messagesApi.list(params);
    // Mock has no genuine processing lag — mirror sentAt into receivedAt so the
    // inbound bubble's dual-timestamp affordance stays consistent in demo mode
    // (gap ~zero). Real backends populate receivedAt from the row's created_at.
    return {
      ...result,
      data: result.data.map((m) => (m.receivedAt ? m : { ...m, receivedAt: m.sentAt })),
    };
  },
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
  resolveMediaUrl: async (mediaUrl) => {
    // Mock media is either an absolute placeholder URL (seed picsum assets) or a
    // bare placeholder name with no real bytes — only the former is navigable.
    const ref = classifyMediaRef(mediaUrl);
    return ref.kind === "absolute" ? ref.url : null;
  },
  listConversationMedia: async (conversationId) => {
    const result = await messagesApi.list({
      conversationId,
      page: 1,
      pageSize: 1000,
      orderDir: "desc",
    });
    return result.data.filter((m) => Boolean(m.mediaType) && Boolean(m.mediaUrl));
  },
};
