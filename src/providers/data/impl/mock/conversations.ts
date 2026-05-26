import { conversationsApi } from "@/mocks";
import type { IConversationsProvider } from "../../contracts/conversations";
import { assertImmutableStoreId, scopedListParams, withOwnSellerScope } from "./_storeScope";

export const mockConversationsProvider: IConversationsProvider = {
  list: (params) => {
    const scoped = scopedListParams(params, "conversation");
    const owned = withOwnSellerScope(scoped, "conversation");
    return conversationsApi.list(owned);
  },
  get: (id) => conversationsApi.get(id),
  update: async (id, patch) => {
    const before = await conversationsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return conversationsApi.update(id, patch);
  },
  markRead: (id) => conversationsApi.markRead(id),
  assignSeller: (id, sellerId) => conversationsApi.assignSeller(id, sellerId),
  archive: (id) => conversationsApi.archive(id),
};
