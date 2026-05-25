import { customersApi } from "@/mocks";
import type { ICustomersProvider } from "../../contracts/customers";
import { logMockMutation } from "./_audit";

export const mockCustomersProvider: ICustomersProvider = {
  list: (params) => customersApi.list(params),
  get: (id) => customersApi.get(id),
  create: async (input) => {
    const created = await customersApi.create(input);
    logMockMutation({
      action: "create",
      resource: "customer",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
  update: async (id, patch) => {
    const before = await customersApi.get(id).catch(() => null);
    const updated = await customersApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "customer",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  delete: async (id) => {
    const before = await customersApi.get(id).catch(() => null);
    await customersApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "customer",
      resourceId: id,
      before,
      storeId: before?.storeId,
    });
  },
  addNote: (customerId, content, authorId) => customersApi.addNote(customerId, content, authorId),
  listNotes: (customerId) => customersApi.listNotes(customerId),
};
