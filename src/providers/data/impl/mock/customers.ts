import { customersApi } from "@/mocks";
import type { ICustomersProvider } from "../../contracts/customers";

export const mockCustomersProvider: ICustomersProvider = {
  list: (params) => customersApi.list(params),
  get: (id) => customersApi.get(id),
  create: (input) => customersApi.create(input),
  update: (id, patch) => customersApi.update(id, patch),
  delete: (id) => customersApi.delete(id),
  addNote: (customerId, content, authorId) => customersApi.addNote(customerId, content, authorId),
  listNotes: (customerId) => customersApi.listNotes(customerId),
};
