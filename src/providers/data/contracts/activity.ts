import type { ID, IConversationActivityEvent } from "@/shared/types";

export interface IActivityProvider {
  getCustomerActivity(customerId: ID): Promise<IConversationActivityEvent[]>;
}
