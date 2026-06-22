import { storesApi } from "@/mocks";
import type { IStoresProvider } from "../../contracts/stores";

export const mockStoresProvider: IStoresProvider = {
  list: () => storesApi.list(),
  get: (id) => storesApi.get(id),
  create: (input) => storesApi.create(input),
  update: (id, patch) => storesApi.update(id, patch),
  setActive: (id, active) => storesApi.setActive(id, active),
  getMemberCounts: () => storesApi.getMemberCounts(),
};
