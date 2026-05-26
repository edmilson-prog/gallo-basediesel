import type { ID, ISdrSession, SdrFinishReason, SdrSessionState } from "@/shared/types";

export interface IListSdrSessionsParams {
  storeId?: ID;
  conversationId?: ID;
  state?: SdrSessionState;
  finishReason?: SdrFinishReason;
  fromDate?: string;
  toDate?: string;
}

/**
 * Contract for the SDR agent session store (PRD-020). Sessions live for the
 * lifetime of an inbox conversation and provide audit/metrics for PRD-024.
 */
export interface ISdrSessionsProvider {
  list(params?: IListSdrSessionsParams): Promise<ISdrSession[]>;
  listActive(): Promise<ISdrSession[]>;
  getByConversation(conversationId: ID): Promise<ISdrSession | null>;
  upsert(session: ISdrSession): Promise<ISdrSession>;
  patch(id: ID, patch: Partial<ISdrSession>): Promise<ISdrSession>;
  pause(id: ID, now?: string): Promise<ISdrSession>;
  resume(id: ID, now?: string): Promise<ISdrSession>;
}
