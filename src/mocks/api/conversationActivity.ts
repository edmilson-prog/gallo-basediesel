import type { ID, IConversationActivityEvent } from "@/shared/types";
import { selectAllConversationActivity } from "../store/selectors";
import { upsert } from "../store/mutations";
import { runApi } from "./utils";

export const conversationActivityApi = {
  async create(event: IConversationActivityEvent): Promise<IConversationActivityEvent> {
    return runApi(
      "conversationActivityApi",
      "create",
      () => upsert("conversationActivity", event),
      { payload: { id: event.conversationId, type: event.type } },
    );
  },

  async getByCustomer(customerId: ID): Promise<IConversationActivityEvent[]> {
    return runApi(
      "conversationActivityApi",
      "getByCustomer",
      () =>
        selectAllConversationActivity()
          .filter((e) => e.customerId === customerId)
          .slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      { payload: { customerId } },
    );
  },
};
