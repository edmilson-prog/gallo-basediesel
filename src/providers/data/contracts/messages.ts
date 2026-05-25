import type { ID, IMessage } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListMessagesParams extends IPaginationParams {
  conversationId: ID;
  orderDir?: "asc" | "desc";
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
}
