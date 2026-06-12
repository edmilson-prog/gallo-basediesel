import type { ID, IMessage, ISO8601, MessageMediaType } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListMessagesParams extends IPaginationParams {
  conversationId: ID;
  orderDir?: "asc" | "desc";
}

/**
 * Bulk read used by analytics surfaces (PRD-051). Implementations may return
 * an empty array when the underlying transport doesn't support bulk reads
 * (in which case the engine degrades gracefully and skips TMR).
 */
export interface IListMessagesForAnalyticsParams {
  since?: string;
  until?: string;
  conversationIds?: ID[];
}

/**
 * Contract for individual conversation messages.
 *
 * @see ../../../mocks/api/messages.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IMessagesProvider {
  list(params: IListMessagesParams): Promise<IPaginatedResult<IMessage>>;
  send(
    conversationId: ID,
    input: Omit<IMessage, "id" | "conversationId" | "sentAt" | "status" | "direction" | "provider">,
  ): Promise<IMessage>;
  markStatus(messageId: ID, status: IMessage["status"]): Promise<IMessage>;
  /**
   * Synthesize an inbound message from the customer/lead side. Used by the
   * mock layer to drive the real-time demo (`useRealtimeConversations`) and
   * to simulate the inbox receiving traffic. An optional `mediaType` attaches
   * a mock media payload so the live inbound archival path is exercised. The
   * Supabase implementation remains a no-op until Fase 2 (PRD-100+) wires real
   * WhatsApp inbound.
   */
  simulateIncoming(
    conversationId: ID,
    text?: string,
    mediaType?: MessageMediaType,
  ): Promise<IMessage>;
  /**
   * Analytics-only bulk read. Returns every message matching the filters.
   * Implementations without bulk support may return an empty array.
   */
  listForAnalytics(params?: IListMessagesForAnalyticsParams): Promise<IMessage[]>;
  /**
   * Timestamp of the customer's last inbound message, or `null` when the
   * customer never wrote. Feeds the Meta 24h session-window countdown
   * (PRD-117) with an exact value even when the loaded message page contains
   * no inbound rows. Supabase resolves via the `last_inbound_at` RPC
   * (SECURITY INVOKER — RLS applies).
   */
  getLastInboundAt(conversationId: ID): Promise<ISO8601 | null>;
  /**
   * Resolve a message's `mediaUrl` into a browser-navigable URL.
   *
   * Inbound WhatsApp media lands as a PRIVATE `whatsapp-media` object PATH
   * (`conversations/<conv>/<msg>/media.<ext>`), not a URL — the Supabase impl
   * mints a short-lived signed URL for it (Storage RLS gates access to the
   * caller's store). Absolute refs (seed/mock/outbound) pass through verbatim;
   * empty or unreadable refs resolve to `null` so the UI can show the media as
   * unavailable instead of a broken element.
   */
  resolveMediaUrl(mediaUrl: string | undefined): Promise<string | null>;
}
