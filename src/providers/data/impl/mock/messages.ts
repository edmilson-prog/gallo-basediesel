import { messagesApi } from "@/mocks";
import type { IMessage } from "@/shared/types";
import type { IMessagesProvider } from "../../contracts/messages";
import { classifyMediaRef, partitionMediaRefs } from "@/shared/utils/mediaRef";

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
  resolveMediaUrls: async (refs) => {
    // Mock has no private bucket — only external absolutes are navigable.
    const plan = partitionMediaRefs(refs);
    const out: Record<string, string | null> = {};
    for (const { ref, url } of plan.passthrough) out[ref] = url;
    for (const { ref } of plan.toSign) out[ref] = null;
    for (const ref of plan.unavailable) out[ref] = null;
    return out;
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
  listCustomerMedia: (customerId) => messagesApi.listCustomerMedia(customerId),
  listLastMessages: async (conversationIds) => {
    // No RLS in the mock store — resolve each conversation's last message
    // directly, mirroring what the supabase RPC exposes for any conversation the
    // caller can access. The lookups are independent → resolve concurrently.
    const resolved = await Promise.all(
      conversationIds.map(async (id): Promise<IMessage | null> => {
        const res = await messagesApi.list({
          conversationId: id,
          page: 1,
          pageSize: 1,
          orderDir: "desc",
        });
        const m = res.data[0];
        if (!m) return null;
        // Mirror the `list` receivedAt fallback (mock has no processing lag).
        return m.receivedAt ? m : { ...m, receivedAt: m.sentAt };
      }),
    );
    return resolved.filter((m): m is IMessage => m !== null);
  },
  retryTranscription: async () => {
    // No-op: nenhuma mensagem mock chega a transcriptionStatus 'failed', então o
    // botão de retry nunca aparece em demonstração. Existe só para satisfazer o
    // contrato IMessagesProvider.
  },
};
