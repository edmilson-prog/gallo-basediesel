import { storesApi } from "@/mocks";
import type { IStoresProvider } from "../../contracts/stores";

export const mockStoresProvider: IStoresProvider = {
  list: () => storesApi.list(),
  get: (id) => storesApi.get(id),
};
