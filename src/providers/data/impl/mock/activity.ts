import { conversationActivityApi } from "@/mocks";
import type { ID, ICustomerTimelinePayload } from "@/shared/types";
import type { IActivityProvider } from "../../contracts/activity";

export const mockActivityProvider: IActivityProvider = {
  getCustomerActivity: (customerId) => conversationActivityApi.getByCustomer(customerId),

  async getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload> {
    const events = await conversationActivityApi.getByCustomer(customerId);
    const byConversation = new Map<ID, typeof events>();
    for (const event of events) {
      const bucket = byConversation.get(event.conversationId);
      if (bucket) bucket.push(event);
      else byConversation.set(event.conversationId, [event]);
    }

    return {
      customerId,
      generatedAt: new Date(0).toISOString(),
      conversations: [...byConversation.entries()].map(([id, list]) => ({
        id,
        channel: list[0]!.conversationChannel,
        status: list[0]!.conversationStatus,
        createdAt: list[0]!.conversationCreatedAt,
        closedAt: null,
        assignedSellerId: list[list.length - 1]!.toSellerId ?? null,
        preRegistro: false,
        messageCount: 0,
        lastMessageAt: null,
        lastMessagePreview: "",
        events: list,
        notes: [],
        quotes: [],
        orders: [],
      })),
    };
  },
};
