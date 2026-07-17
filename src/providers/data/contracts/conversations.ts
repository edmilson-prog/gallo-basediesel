import type {
  IConversation,
  IConversationContact,
  IDistributionTrace,
  IIdleSummary,
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
  /** Free-text search across customer/lead name and phone ONLY — see `searchMessages` for message content. */
  search?: string;
  /** ISO8601 lower bound on `lastMessageAt` (inclusive). */
  fromDate?: string;
  /** ISO8601 upper bound on `lastMessageAt` (inclusive). */
  toDate?: string;
  /** Conversations with no `assignedSellerId`. */
  unassigned?: boolean;
  /**
   * Combined assignment filter (Inbox multi-select). OR across the provided
   * criteria (sellerIds, queue); when omitted/empty, NO assignment constraint
   * is applied. Coexists with the scalar `assignedSellerId`/`unassigned`/
   * `isSdrActive` used by other callers (customer detail, dashboards) — the
   * Inbox uses this instead.
   */
  assignmentAny?: {
    /** Specific assigned sellers (already includes "me" resolved to an id). */
    sellerIds?: ID[];
    /** Queue: pool + `is_sdr_active=false` + `status='aguardando'`. */
    queue?: boolean;
  };
  orderBy?: ConversationsOrderBy;
  orderDir?: "asc" | "desc";
  /**
   * When `false`, skips the exact total computation and `total` comes back as
   * `-1` (Inbox hot path: PostgREST `count: "exact"` re-evaluates the per-row
   * RLS gate over the WHOLE candidate set on every page — the 2026-07-02
   * statement-timeout incident). Callers that need the real total use
   * `count()` instead. Defaults to `true` (all other callers keep today's
   * behavior). The mock impl may still return the real total (its data is
   * in-memory and cheap); only the supabase path returns the -1 sentinel —
   * never rely on it.
   */
  withTotal?: boolean;
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
  /**
   * Exact count of conversations matching the Inbox NO-SEARCH list filters
   * (status/channel/instance/isSdrActive/tags/period/assignmentAny). Cheap by
   * construction on supabase: a SECURITY DEFINER RPC with the access model as
   * set predicates ("gated-once"), instead of the per-row RLS count that
   * `list`'s `count: "exact"` implies. NOT supported with `storeId`, `search`
   * (a non-blank term), `customerId`, `leadId`, or the scalar
   * `assignedSellerId`/`unassigned` params — those callers keep using `list`'s
   * total (the impls throw on them via `assertInboxCountParams`).
   */
  count(params?: IListConversationsParams): Promise<number>;
  get(id: ID): Promise<IConversation>;
  update(id: ID, patch: Partial<IConversation>): Promise<IConversation>;
  markRead(id: ID): Promise<IConversation>;
  assignSeller(id: ID, sellerId: ID): Promise<IConversation>;
  /**
   * Remove the assignee — return the conversation to the pool/queue
   * (`assigned_seller_id = null`). Allowed only to staff at the RLS layer
   * (`conversations_update` WITH CHECK requires `is_staff()` to null the
   * column); the UI hides the action for non-staff. Symmetric with assignSeller.
   */
  unassign(id: ID): Promise<IConversation>;
  archive(id: ID): Promise<void>;
  /** Close a conversation atomically: set the terminal status AND unassign +
   *  clear SDR, in one server op (no transitional aguardando). */
  close(id: ID, status: "resolvida" | "arquivada"): Promise<IConversation>;
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
  /**
   * Dedicated search across MESSAGE TEXT (not contact identity — see `list`'s
   * `search`). An explicit, heavier action the Inbox opts into via the "Buscar
   * nas mensagens" CTA, never mixed with the regular contact search.
   *
   * Honors every other `IListConversationsParams` filter (status/channel/
   * instance/assignment/tags/period/pagination); `params.search` is required
   * (empty/whitespace-only yields zero rows). Each result's `matchedMessage`
   * is the most recently matching message plus a count of other matches in
   * that same conversation.
   */
  searchMessages(params: IListConversationsParams): Promise<IPaginatedResult<IConversation>>;
  /**
   * Idle-conversation summary for the SIGNED-IN seller (spec 2026-07-16):
   * conversations assigned to them where the customer awaits a reply, with
   * level (1-3) computed in business hours of their PRD-212 schedule.
   * Supabase: SECURITY DEFINER RPC `idle_conversations_summary` (gated-once).
   * Mock: deterministic computation over the mock store. Store toggle OFF ⇒
   * empty summary.
   */
  getIdleSummary(): Promise<IIdleSummary>;
}
