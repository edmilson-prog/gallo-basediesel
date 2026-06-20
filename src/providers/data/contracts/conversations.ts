import type {
  IConversation,
  IConversationContact,
  IDistributionTrace,
  IMessage,
  ID,
  ISO8601,
} from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

/** Ordering modes supported by `IConversationsProvider.list`. */
export type ConversationsOrderBy = "lastMessageAt" | "abcClass";

export interface IListConversationsParams extends IPaginationParams {
  storeId?: ID;
  assignedSellerId?: ID;
  /** Filter by a specific status, or by a set of allowed statuses. */
  status?: IConversation["status"] | IConversation["status"][];
  channel?: IConversation["channel"];
  /** Filter by the WhatsApp instance (account) the conversation belongs to. */
  whatsappAccountId?: ID;
  isSdrActive?: boolean;
  customerId?: ID;
  leadId?: ID;
  /** Customer tags — conversations match when ANY tag is present. */
  tags?: string[];
  /** Free-text search across customer/lead name, phone, and recent messages. */
  search?: string;
  /** ISO8601 lower bound on `lastMessageAt` (inclusive). */
  fromDate?: string;
  /** ISO8601 upper bound on `lastMessageAt` (inclusive). */
  toDate?: string;
  /** Conversations with no `assignedSellerId`. */
  unassigned?: boolean;
  orderBy?: ConversationsOrderBy;
  orderDir?: "asc" | "desc";
}

/**
 * Input for a new inbound conversation. The engine (PRD-013) runs against
 * these fields to pick a seller / SDR / fila.
 */
export interface ICreateConversationInput {
  storeId: ID;
  channel: IConversation["channel"];
  whatsappAccountId?: ID;
  customerId?: ID;
  leadId?: ID;
  /** First customer message — used by the engine for keyword matching. */
  firstMessageText: string;
  /** When the message arrived. Defaults to `now` if omitted. */
  occurredAt?: ISO8601;
}

/** Result of creating a conversation — exposes the engine decision too. */
export interface ICreateConversationResult {
  conversation: IConversation;
  /** First-message bubble (always created) plus the optional system bubble. */
  messages: IMessage[];
  trace: IDistributionTrace;
}

/**
 * Outbound conversation creation (multi-instância — "Nova conversa"): a seller
 * opens a WhatsApp thread from a chosen instance. Unlike {@link ICreateConversationInput},
 * this skips the distribution engine — the conversation is assigned to the
 * CREATOR and starts empty (the first message is sent from the composer).
 * `assignedSellerId` MUST be the caller's own seller id (conversations_insert
 * RLS WITH CHECK: store + self-assignment).
 */
export interface ICreateOutboundConversationInput {
  storeId: ID;
  whatsappAccountId: ID;
  assignedSellerId: ID;
  customerId: ID;
}

/**
 * Contract for WhatsApp / multichannel conversation access.
 *
 * @see ../../../mocks/api/conversations.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IConversationsProvider {
  list(params?: IListConversationsParams): Promise<IPaginatedResult<IConversation>>;
  get(id: ID): Promise<IConversation>;
  update(id: ID, patch: Partial<IConversation>): Promise<IConversation>;
  markRead(id: ID): Promise<IConversation>;
  assignSeller(id: ID, sellerId: ID): Promise<IConversation>;
  archive(id: ID): Promise<void>;
  /**
   * Create a new inbound conversation. Runs the distribution engine (PRD-013)
   * to assign a seller / SDR / queue and emits the corresponding audit trace
   * + system messages.
   */
  create(input: ICreateConversationInput): Promise<ICreateConversationResult>;
  /**
   * Create an OUTBOUND conversation (multi-instância). Assigned to the creator,
   * bound to the chosen instance, no distribution / no inbound bubble.
   */
  createOutbound(input: ICreateOutboundConversationInput): Promise<IConversation>;
  /**
   * Resolve display-ready contact info (name/phone/avatar) for the given
   * conversations — for the Inbox list + the conversation header. Returns a row
   * only for conversations the caller can access; POOL conversations included
   * (supabase: the SECURITY DEFINER `conversation_contacts` RPC gated by
   * can_access_conversation, so the contact name is visible even when the
   * customers RLS would hide the row for an unassigned conversation).
   */
  listContacts(conversationIds: ID[]): Promise<IConversationContact[]>;
}
