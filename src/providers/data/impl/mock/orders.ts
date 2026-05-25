import { ordersApi } from "@/mocks";
import type { IOrdersProvider } from "../../contracts/orders";
import { logMockMutation } from "./_audit";

export const mockOrdersProvider: IOrdersProvider = {
  list: (params) => ordersApi.list(params),
  get: (id) => ordersApi.get(id),
  listByCustomer: (customerId) => ordersApi.listByCustomer(customerId),
  create: async (input) => {
    const created = await ordersApi.create(input);
    logMockMutation({
      action: "create",
      resource: "order",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
  update: async (id, patch) => {
    const before = await ordersApi.get(id).catch(() => null);
    const updated = await ordersApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "order",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  delete: async (id) => {
    const before = await ordersApi.get(id).catch(() => null);
    await ordersApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "order",
      resourceId: id,
      before,
      storeId: before?.storeId,
    });
  },
};
