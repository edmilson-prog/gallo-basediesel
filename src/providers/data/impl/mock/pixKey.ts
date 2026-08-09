import type { ID, IPixKey } from "@/shared/types";
import { pixKeyApi } from "@/mocks";
import type { IPixKeyProvider } from "../../contracts/pixKey";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockPixKeyProvider: IPixKeyProvider = {
  list: (params) => pixKeyApi.list(params),

  get: (id) => pixKeyApi.get(id),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await pixKeyApi.create(scoped);
    // A PIX key is the company's, not the seller's — every mutation is governed.
    logMockMutation({
      action: "create",
      resource: "pix_key",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: async (id, patch) => {
    const before = await pixKeyApi.get(id).catch(() => null);
    const updated: IPixKey = await pixKeyApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "pix_key",
      resourceId: id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  delete: async (id) => {
    const removed = await pixKeyApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "pix_key",
      resourceId: id,
      before: removed,
      storeId: removed.storeId,
    });
    return removed;
  },
};
