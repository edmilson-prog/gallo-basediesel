import { quotesApi } from "@/mocks";
import type { IQuotesProvider } from "../../contracts/quotes";
import { logMockMutation } from "./_audit";

export const mockQuotesProvider: IQuotesProvider = {
  list: (params) => quotesApi.list(params),
  get: (id) => quotesApi.get(id),
  create: async (input) => {
    const created = await quotesApi.create(input);
    logMockMutation({
      action: "create",
      resource: "quote",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
  update: async (id, patch) => {
    const before = await quotesApi.get(id).catch(() => null);
    const updated = await quotesApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "quote",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  delete: async (id) => {
    const before = await quotesApi.get(id).catch(() => null);
    await quotesApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "quote",
      resourceId: id,
      before,
      storeId: before?.storeId,
    });
  },
};
