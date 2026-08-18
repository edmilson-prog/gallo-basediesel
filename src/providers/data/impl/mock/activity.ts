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
        // The owner filter must be "not a participant event", NOT "is an assignment event".
        // The SQL trigger (conversation_activity_capture) types an event `status` whenever
        // the status changed, even if the seller ALSO changed in the same UPDATE — and
        // taking over a conversation typically changes both at once. In production this
        // means most real ownership changes are typed `status`, not `assignment` (measured:
        // 1,478 `status` events carry a toSellerId vs. only 143 `assignment` events). So the
        // owner-bearing event can be `created`, `assignment`, `status`, or `reopen` — the only
        // types that never name the owner are `participant_add`/`participant_remove`, which
        // reuse `toSellerId` for the collaborator being added/removed.
        const ownerEvents = list.filter(
          (e) => e.type !== "participant_add" && e.type !== "participant_remove" && e.toSellerId,
        );
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
