import { partsApi } from "@/mocks";
import type { IPartsProvider } from "../../contracts/parts";

export const mockPartsProvider: IPartsProvider = {
  list: (params) => partsApi.list(params),
  get: (id) => partsApi.get(id),
  findByOem: (code) => partsApi.findByOem(code),
  listEquivalents: (id) => partsApi.listEquivalents(id),
  create: (input) => partsApi.create(input),
  update: (id, patch) => partsApi.update(id, patch),
  delete: (id) => partsApi.delete(id),
};
