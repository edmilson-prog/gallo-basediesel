import { conversationActivityApi, conversationsApi } from "@/mocks";
import { selectMessagesByConversation } from "@/mocks/store/selectors";
import { getMessagePreview } from "@/features/conversations/utils/conversationDisplay";
import type {
  ID,
  IConversationActivityEvent,
  ICustomerTimelineNote,
  ICustomerTimelinePayload,
} from "@/shared/types";
import type { IActivityProvider } from "../../contracts/activity";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { mockConversationNotesProvider } from "./conversationNotes";

// Same cutover instant the RPC backfill uses (see
// supabase/migrations/20260818120000_get_customer_timeline.sql and
// .../20260818122000_backfill_pre_registro.sql) — conversations created
// before the activity-capture trigger existed never got a `created` event,
// so their opening is unrecoverable and the UI must warn about it.
const PRE_REGISTRO_MARKER = Date.parse("2026-07-04T01:43:17.000Z");

// Mirrors the RPC's `left(coalesce(m.text, ''), 120)` (see
// supabase/migrations/20260818120000_get_customer_timeline.sql:50) so mock
// mode can't show a longer preview than production ever would. Truncated
// here, at the call site — `getMessagePreview` is shared with other callers
// (e.g. the Inbox list) that must keep their current, untruncated behavior.
const PREVIEW_MAX_LENGTH = 120;

export const mockActivityProvider: IActivityProvider = {
  /**
   * Cards are derived from CONVERSATIONS, not from events — the same direction
   * the RPC reads: its `conv` CTE starts at `public.conversations` and every
   * other source (activity, notes, messages, deals) is left-joined onto it.
   *
   * Grouping events into cards instead would silently drop the very case this
   * feature exists for: a conversation carrying NO event at all. Those are
   * exactly the pre-marker conversations the backfill targets and the
   * "pré-registro" warning explains — deriving from events would make them
   * vanish from the fiche in mock mode while production renders them.
   *
   * Consequently every conversation-level scalar (channel, status, createdAt,
   * closedAt, assignedSellerId) is read straight off the conversation record,
   * matching the RPC column-for-column, instead of being reconstructed from the
   * event trail. Note the RPC's own semantics travel with that: closing a
   * conversation drops `assigned_seller_id` (migration 20260704120000), so a
   * closed conversation reports no owner — in mock mode exactly as in prod.
   */
  async getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload> {
    const { data: conversationRecords } = await conversationsApi.list({
      customerId,
      page: 1,
      pageSize: FETCH_ALL_PAGE_SIZE,
    });

    const events = await conversationActivityApi.getByCustomer(customerId);
    const eventsByConversation = new Map<ID, IConversationActivityEvent[]>();
    for (const event of events) {
      const bucket = eventsByConversation.get(event.conversationId);
      if (bucket) bucket.push(event);
      else eventsByConversation.set(event.conversationId, [event]);
    }

    const conversations = await Promise.all(
      conversationRecords.map(async (conversation) => {
        const messages = selectMessagesByConversation(conversation.id)
          .slice()
          .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
        const lastMessage = messages[messages.length - 1] ?? null;

        const rawNotes = await mockConversationNotesProvider.list(conversation.id);
        const notes: ICustomerTimelineNote[] = rawNotes.map((note) => ({
          id: note.id,
          at: note.createdAt,
          authorId: note.authorId,
          body: note.content,
        }));

        return {
          id: conversation.id,
          channel: conversation.channel,
          status: conversation.status,
          createdAt: conversation.createdAt,
          closedAt: conversation.closedAt ?? null,
          assignedSellerId: conversation.assignedSellerId ?? null,
          preRegistro: Date.parse(conversation.createdAt) < PRE_REGISTRO_MARKER,
          messageCount: messages.length,
          lastMessageAt: lastMessage?.sentAt ?? null,
          lastMessagePreview: getMessagePreview(lastMessage).slice(0, PREVIEW_MAX_LENGTH),
          events: eventsByConversation.get(conversation.id) ?? [],
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
