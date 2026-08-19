import type { ID, ICustomerTimelinePayload } from "@/shared/types";

export interface IActivityProvider {
  /** Folded timeline: conversations with events, notes, deals and message aggregate. */
  getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload>;
}
