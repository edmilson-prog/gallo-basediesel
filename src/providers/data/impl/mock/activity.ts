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
      conversations: [...byConversation.entries()].map(([id, list]) => {
        const last = list[list.length - 1]!;
        // `created`/`assignment` are the only event types where `toSellerId` names the
        // conversation's OWNER — `participant_add`/`participant_remove` reuse the field
        // for the collaborator being added/removed, so they must be excluded here.
        const ownerEvents = list.filter((e) => e.type === "created" || e.type === "assignment");
        const lastOwnerEvent = ownerEvents[ownerEvents.length - 1];

        return {
          id,
          channel: list[0]!.conversationChannel,
          // `conversationStatus` is a live snapshot taken when each event was emitted,
          // so the last event holds the most recent value (list is ascending by createdAt).
          status: last.conversationStatus,
          // `conversationCreatedAt` is constant across a conversation's events (the
          // conversation's own createdAt never changes), so first vs. last is equivalent.
          createdAt: list[0]!.conversationCreatedAt,
          closedAt: null,
          assignedSellerId: lastOwnerEvent?.toSellerId ?? null,
          preRegistro: false,
          messageCount: 0,
          lastMessageAt: null,
          lastMessagePreview: "",
          events: list,
          notes: [],
          quotes: [],
          orders: [],
        };
      }),
    };
  },
};
