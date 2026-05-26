import { segmentsApi } from "@/mocks";
import type { ISegmentsProvider } from "../../contracts/segments";
import { logMockMutation } from "./_audit";

export const mockSegmentsProvider: ISegmentsProvider = {
  list: (params) => segmentsApi.list(params),
  create: async (input) => {
    const created = await segmentsApi.create(input);
    logMockMutation({
      action: "create",
      resource: "segment",
      resourceId: created.id,
      after: created,
    });
    return created;
  },
  update: async (id, patch) => {
    const updated = await segmentsApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "segment",
      resourceId: updated.id,
      after: updated,
    });
    return updated;
  },
  delete: async (id) => {
    await segmentsApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "segment",
      resourceId: id,
    });
  },
};
