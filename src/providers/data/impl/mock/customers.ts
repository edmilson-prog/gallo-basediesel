import { conversationsApi, customersApi } from "@/mocks";
import type { ICustomersProvider } from "../../contracts/customers";
import { logMockMutation } from "./_audit";
import { assertImmutableStoreId, scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockCustomersProvider: ICustomersProvider = {
  list: (params) => customersApi.list(scopedListParams(params, "customer")),
  get: (id) => customersApi.get(id),
  create: async (input) => {
    const created = await customersApi.create(withCreateStoreId(input));
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
    assertImmutableStoreId(before, patch);
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
  getViaConversation: async (conversationId) => {
    // No RLS in the mock store — resolve conversation → its customer directly,
    // mirroring the supabase conversation-gated RPC. Null when the conversation
    // is missing or has no linked customer (e.g. a lead-only conversation).
    const conv = await conversationsApi.get(conversationId).catch(() => null);
    if (!conv?.customerId) return null;
    return customersApi.get(conv.customerId).catch(() => null);
  },
};
