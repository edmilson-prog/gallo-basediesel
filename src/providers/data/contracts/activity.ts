import type { ID, IConversationActivityEvent, ICustomerTimelinePayload } from "@/shared/types";

export interface IActivityProvider {
  getCustomerActivity(customerId: ID): Promise<IConversationActivityEvent[]>;
  /** Folded timeline: conversations with events, notes, deals and message aggregate. */
  getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload>;
}
