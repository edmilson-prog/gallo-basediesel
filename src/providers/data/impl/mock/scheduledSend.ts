import type { ID, IScheduledSend } from "@/shared/types";
import { scheduledSendApi } from "@/mocks";
import type { IScheduledSendProvider } from "../../contracts/scheduledSend";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockScheduledSendProvider: IScheduledSendProvider = {
  list: (conversationId) => scheduledSendApi.list(conversationId),

  listDue: (now) => scheduledSendApi.listDue(now),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await scheduledSendApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "scheduled_send",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: (id, patch) => scheduledSendApi.update(id, patch),

  cancel: async (id) => {
    const updated = await scheduledSendApi.cancel(id);
    logMockMutation({
      action: "cancel",
      resource: "scheduled_send",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  markSent: (id) => scheduledSendApi.markSent(id),

  markFailed: (id, reason) => scheduledSendApi.markFailed(id, reason),
};
