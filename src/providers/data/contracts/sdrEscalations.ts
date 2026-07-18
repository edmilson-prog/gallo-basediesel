import type {
  ID,
  ISdrEscalation,
  SdrEscalationMode,
  SdrEscalationReason,
  SdrEscalationStatus,
} from "@/shared/types";

export interface IListSdrEscalationsParams {
  storeId?: ID;
  conversationId?: ID;
  sessionId?: ID;
  customerId?: ID;
  status?: SdrEscalationStatus;
  mode?: SdrEscalationMode;
  reason?: SdrEscalationReason;
  assignedSellerId?: ID;
  fromDate?: string;
  toDate?: string;
}

/**
 * Contract for the SDR-escalation store (PRD-023). One record per handoff;
 * kept around forever for audit and analytics.
 */
export interface ISdrEscalationsProvider {
  list(params?: IListSdrEscalationsParams): Promise<ISdrEscalation[]>;
  getById(id: ID): Promise<ISdrEscalation | null>;
  getByConversation(conversationId: ID): Promise<ISdrEscalation | null>;
  create(escalation: ISdrEscalation): Promise<ISdrEscalation>;
  patch(id: ID, patch: Partial<ISdrEscalation>): Promise<ISdrEscalation>;
  /** Atomically claims a broadcasting escalation for `sellerId`. Throws if
   *  already claimed or if the escalation isn't in a claimable status. */
  claim(id: ID, sellerId: ID): Promise<ISdrEscalation>;
}
