/**
 * Customer attendance timeline builder.
 *
 * Pure function — no I/O, no Date.now(). Folds the four sources returned by
 * get_customer_timeline into one trail per conversation and applies the three
 * display rules agreed in the spec:
 *
 *  - filtering shrinks a card, it never removes it;
 *  - messages arrive aggregated, one item per conversation;
 *  - a conversation born before the trigger carries a warning, and collapses
 *    only when it holds no event whatsoever.
 */

import type {
  ConversationChannel,
  ConversationStatus,
  ICustomerTimelineConversation,
  ICustomerTimelinePayload,
  ID,
} from "@/shared/types";

export type TimelineFilter = "tudo" | "conversa" | "nota" | "historico";

export interface ITimelineCardItem {
  id: string;
  kind: "conversa" | "nota" | "historico";
  at: string;
  /** Present only on the aggregated message item. */
  messageCount?: number;
  preview?: string;
  /** Raw payload for the renderer — event, note or deal, depending on kind. */
  source: unknown;
}

export interface ITimelineCard {
  conversationId: ID;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: string;
  closedAt: string | null;
  preRegistro: boolean;
  /** Pre-registro AND no event at all — renders folded, with the warning. */
  collapsed: boolean;
  items: ITimelineCardItem[];
  summary: {
    itemCount: number;
    ownerId: ID | null;
    /** Open→close span; null while the conversation is still open. */
    durationMs: number | null;
  };
}

function itemsOf(conversation: ICustomerTimelineConversation): ITimelineCardItem[] {
  const items: ITimelineCardItem[] = [];

  if (conversation.messageCount > 0 && conversation.lastMessageAt) {
    items.push({
      id: `msg-${conversation.id}`,
      kind: "conversa",
      at: conversation.lastMessageAt,
      messageCount: conversation.messageCount,
      preview: conversation.lastMessagePreview,
      source: null,
    });
  }

  for (const note of conversation.notes) {
    items.push({ id: note.id, kind: "nota", at: note.at, source: note });
  }

  for (const event of conversation.events) {
    items.push({ id: event.id, kind: "historico", at: event.createdAt, source: event });
  }

  // Deals read as commercial outcome of the attendance — same slice as the
  // lifecycle, so they narrow together under "Histórico".
  for (const deal of [...conversation.quotes, ...conversation.orders]) {
    items.push({ id: deal.id, kind: "historico", at: deal.at, source: deal });
  }

  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function buildCustomerTimeline(
  payload: ICustomerTimelinePayload,
  filter: TimelineFilter,
): ITimelineCard[] {
  return payload.conversations.map((conversation) => {
    const all = itemsOf(conversation);
    // Rule: the filter narrows the contents, never the card list.
    const items = filter === "tudo" ? all : all.filter((item) => item.kind === filter);

    return {
      conversationId: conversation.id,
      channel: conversation.channel,
      status: conversation.status,
      createdAt: conversation.createdAt,
      closedAt: conversation.closedAt,
      preRegistro: conversation.preRegistro,
      collapsed: conversation.preRegistro && conversation.events.length === 0,
      items,
      summary: {
        itemCount: all.length,
        ownerId: conversation.assignedSellerId,
        durationMs: conversation.closedAt
          ? Date.parse(conversation.closedAt) - Date.parse(conversation.createdAt)
          : null,
      },
    };
  });
}
