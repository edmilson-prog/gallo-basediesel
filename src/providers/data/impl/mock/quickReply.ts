import type { ID, IQuickReply } from "@/shared/types";
import { quickReplyApi } from "@/mocks";
import type { IQuickReplyProvider } from "../../contracts/quickReply";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockQuickReplyProvider: IQuickReplyProvider = {
  list: (params) => quickReplyApi.list(params),

  get: (id) => quickReplyApi.get(id),

  findByShortcut: (shortcut, sellerId) => quickReplyApi.findByShortcut(shortcut, sellerId),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await quickReplyApi.create(scoped);
    // Creating/editing a `shared` snippet is governed (D-12).
    if (created.scope === "shared") {
      logMockMutation({
        action: "create",
        resource: "quick_reply",
        resourceId: created.id,
        after: created,
        storeId: created.storeId,
      });
    }
    return created;
  },

  update: async (id, patch) => {
    const before = await quickReplyApi.get(id).catch(() => null);
    const updated = await quickReplyApi.update(id, patch);
    if (updated.scope === "shared" || before?.scope === "shared") {
      logMockMutation({
        action: "update",
        resource: "quick_reply",
        resourceId: id,
        before,
        after: updated,
        storeId: updated.storeId,
      });
    }
    return updated;
  },

  delete: async (id) => {
    const removed = await quickReplyApi.delete(id);
    if (removed.scope === "shared") {
      logMockMutation({
        action: "delete",
        resource: "quick_reply",
        resourceId: id,
        before: removed,
        storeId: removed.storeId,
      });
    }
    return removed;
  },
};
