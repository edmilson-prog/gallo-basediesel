import { leadsApi } from "@/mocks";
import type { ILeadsProvider } from "../../contracts/leads";

export const mockLeadsProvider: ILeadsProvider = {
  list: (params) => leadsApi.list(params),
  get: (id) => leadsApi.get(id),
  create: (input) => leadsApi.create(input),
  update: (id, patch) => leadsApi.update(id, patch),
  delete: (id) => leadsApi.delete(id),
};
