import { ordersApi } from "@/mocks";
import type { IOrdersProvider } from "../../contracts/orders";

export const mockOrdersProvider: IOrdersProvider = {
  list: (params) => ordersApi.list(params),
  get: (id) => ordersApi.get(id),
  listByCustomer: (customerId) => ordersApi.listByCustomer(customerId),
  create: (input) => ordersApi.create(input),
  update: (id, patch) => ordersApi.update(id, patch),
  delete: (id) => ordersApi.delete(id),
};
