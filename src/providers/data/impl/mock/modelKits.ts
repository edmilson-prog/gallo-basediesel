import { modelKitsApi } from "@/mocks";
import type { IModelKitsProvider } from "../../contracts/modelKits";

export const mockModelKitsProvider: IModelKitsProvider = {
  list: (params) => modelKitsApi.list(params),
  get: (id) => modelKitsApi.get(id),
  applicationCounts: (kitIds) => modelKitsApi.applicationCounts(kitIds),
  create: (input) => modelKitsApi.create(input),
  update: (id, patch) => modelKitsApi.update(id, patch),
  delete: (id) => modelKitsApi.remove(id),
};
