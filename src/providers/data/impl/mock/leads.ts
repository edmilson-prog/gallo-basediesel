import { leadsApi } from "@/mocks";
import type { ILeadsProvider } from "../../contracts/leads";
import { assertImmutableStoreId, scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockLeadsProvider: ILeadsProvider = {
  list: (params) => leadsApi.list(scopedListParams(params, "lead")),
  get: (id) => leadsApi.get(id),
  create: (input) => leadsApi.create(withCreateStoreId(input)),
  update: async (id, patch) => {
    const before = await leadsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return leadsApi.update(id, patch);
  },
  delete: (id) => leadsApi.delete(id),
};
