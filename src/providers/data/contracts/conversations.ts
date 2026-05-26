import type { IConversation, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

/** Ordering modes supported by `IConversationsProvider.list`. */
export type ConversationsOrderBy = "lastMessageAt" | "abcClass";

export interface IListConversationsParams extends IPaginationParams {
  storeId?: ID;
  assignedSellerId?: ID;
  /** Filter by a specific status, or by a set of allowed statuses. */
  status?: IConversation["status"] | IConversation["status"][];
  channel?: IConversation["channel"];
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
}
