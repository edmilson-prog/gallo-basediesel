import { conversationActivityApi } from "@/mocks";
import { selectMessagesByConversation } from "@/mocks/store/selectors";
import { getMessagePreview } from "@/features/conversations/utils/conversationDisplay";
import type { ID, ICustomerTimelineNote, ICustomerTimelinePayload } from "@/shared/types";
import type { IActivityProvider } from "../../contracts/activity";
import { mockConversationNotesProvider } from "./conversationNotes";

// Same cutover instant the RPC backfill uses (see
// supabase/migrations/20260818120000_get_customer_timeline.sql and
// .../20260818122000_backfill_pre_registro.sql) — conversations created
// before the activity-capture trigger existed never got a `created` event,
// so their opening is unrecoverable and the UI must warn about it.
const PRE_REGISTRO_MARKER = Date.parse("2026-07-04T01:43:17.000Z");

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

    const conversations = await Promise.all(
      [...byConversation.entries()].map(async ([id, list]) => {
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

        // `conversationCreatedAt` is constant across a conversation's events (the
        // conversation's own createdAt never changes), so first vs. last is equivalent.
        const createdAt = list[0]!.conversationCreatedAt;

        const messages = selectMessagesByConversation(id)
          .slice()
          .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
        const lastMessage = messages[messages.length - 1] ?? null;

        const rawNotes = await mockConversationNotesProvider.list(id);
        const notes: ICustomerTimelineNote[] = rawNotes.map((note) => ({
          id: note.id,
          at: note.createdAt,
          authorId: note.authorId,
          body: note.content,
        }));

        return {
          id,
          channel: list[0]!.conversationChannel,
          // `conversationStatus` is a live snapshot taken when each event was emitted,
          // so the last event holds the most recent value (list is ascending by createdAt).
          status: last.conversationStatus,
          createdAt,
          closedAt: null,
          assignedSellerId: lastOwnerEvent?.toSellerId ?? null,
          preRegistro: Date.parse(createdAt) < PRE_REGISTRO_MARKER,
          messageCount: messages.length,
          lastMessageAt: lastMessage?.sentAt ?? null,
          lastMessagePreview: getMessagePreview(lastMessage),
          events: list,
          notes,
          // Out of scope for this round: `IQuote`/`IOrder` both carry an optional
          // `conversationId`, but the quote generator never sets it and the order
          // generator only sets it for `origin === "fromConversation"` — there is no
          // `selectQuotesByConversation`/`selectOrdersByConversation` selector yet, so
          // wiring this reliably needs its own pass rather than a guess here. Left
          // empty deliberately (not silently) — the RPC-backed Supabase path is
          // unaffected, since the RPC joins on real conversation_id columns.
          quotes: [],
          orders: [],
        };
      }),
    );

    return {
      customerId,
      generatedAt: new Date(0).toISOString(),
      conversations,
    };
  },
};
