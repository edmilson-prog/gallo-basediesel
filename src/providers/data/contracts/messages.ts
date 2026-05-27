import type { ID, IMessage } from "@/shared/types";
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
   * to simulate the inbox receiving traffic. The Supabase implementation
   * remains a no-op until Fase 2 (PRD-100+) wires real WhatsApp inbound.
   */
  simulateIncoming(conversationId: ID, text?: string): Promise<IMessage>;
  /**
   * Analytics-only bulk read. Returns every message matching the filters.
   * Implementations without bulk support may return an empty array.
   */
  listForAnalytics(params?: IListMessagesForAnalyticsParams): Promise<IMessage[]>;
}
