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
  /**
   * Batch variant of {@link resolveMediaUrl}: resolve many refs in one go so a
   * conversation's media signs in a single round-trip instead of N. Returns a
   * map keyed by the ORIGINAL ref (the value passed in), so callers can seed the
   * per-item `useResolvedMediaUrl` cache directly. Refs absent from the map were
   * not requested; a present `null` means unavailable.
   */
  resolveMediaUrls(refs: string[]): Promise<Record<string, string | null>>;
  /**
   * Messages of a conversation that carry displayable media (image/audio/video/
   * document) WITH bytes available (non-null `mediaUrl`), newest first. Feeds
   * the conversation media side panel. Inbound media whose download failed or
   * expired has a null url and is therefore excluded.
   */
  listConversationMedia(conversationId: ID): Promise<IMessage[]>;
  /**
   * Like {@link listConversationMedia} but across ALL of a customer's
   * conversations — feeds the customer fiche "Mídias" tab. Newest first, only
   * media with bytes available.
   */
  listCustomerMedia(customerId: ID): Promise<IMessage[]>;
  /**
   * The most recent message of each given conversation, for the conversations
   * the caller can access — in ONE round-trip. Backs the Inbox list preview:
   * replaces the ~50 concurrent `list({ pageSize: 1 })` calls (each
   * re-evaluating the RLS access gate) that saturated the backend (500s) for a
   * non-staff seller. Supabase resolves via the SECURITY DEFINER
   * `last_messages_for_conversations` RPC gated by `can_access_conversation`
   * over the bounded id list (never a per-message access check). Conversations
   * the caller can't access are simply absent from the result.
   */
  listLastMessages(conversationIds: ID[]): Promise<IMessage[]>;
}
