import { conversationActivityApi } from "@/mocks";
import type { IActivityProvider } from "../../contracts/activity";

export const mockActivityProvider: IActivityProvider = {
  getCustomerActivity: (customerId) => conversationActivityApi.getByCustomer(customerId),
};
