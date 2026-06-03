import { serviceKitsApi } from "@/mocks";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

export const mockServiceKitsProvider: IServiceKitsProvider = {
  list: (params) => serviceKitsApi.list(params),
  create: (input) => serviceKitsApi.create(input),
  update: (id, patch) => serviceKitsApi.update(id, patch),
  remove: (id) => serviceKitsApi.remove(id),
  duplicate: (id) => serviceKitsApi.duplicate(id),
};
