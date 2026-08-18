import { suppliersApi } from "@/mocks";
import type { ISuppliersProvider } from "../../contracts/suppliers";

export const mockSuppliersProvider: ISuppliersProvider = {
  list: (params) => suppliersApi.list(params),
  get: (id) => suppliersApi.get(id),
  create: (input) => suppliersApi.create(input),
  update: (id, patch) => suppliersApi.update(id, patch),
  archive: (id) => suppliersApi.archive(id),
  stats: (id) => suppliersApi.stats(id),
  statsMany: (ids) => suppliersApi.statsMany(ids),
};
