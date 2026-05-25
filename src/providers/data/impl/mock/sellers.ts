import { sellersApi } from "@/mocks";
import type { ISellersProvider } from "../../contracts/sellers";

export const mockSellersProvider: ISellersProvider = {
  list: (params) => sellersApi.list(params),
  get: (id) => sellersApi.get(id),
  setAvailability: (id, availability) => sellersApi.setAvailability(id, availability),
};
