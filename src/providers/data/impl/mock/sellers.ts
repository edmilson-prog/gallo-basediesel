import { sellersApi } from "@/mocks";
import type { ISellersProvider } from "../../contracts/sellers";
import { scopedListParams } from "./_storeScope";

export const mockSellersProvider: ISellersProvider = {
  list: (params) => sellersApi.list(scopedListParams(params, "seller")),
  get: (id) => sellersApi.get(id),
  setAvailability: (id, availability) => sellersApi.setAvailability(id, availability),
};
