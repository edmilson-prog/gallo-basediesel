import type { IConversation, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListConversationsParams extends IPaginationParams {
  storeId?: ID;
  assignedSellerId?: ID;
  status?: IConversation["status"];
  channel?: IConversation["channel"];
  isSdrActive?: boolean;
  customerId?: ID;
  leadId?: ID;
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
