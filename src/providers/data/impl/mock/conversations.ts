import { conversationsApi } from "@/mocks";
import type { IConversationsProvider } from "../../contracts/conversations";

export const mockConversationsProvider: IConversationsProvider = {
  list: (params) => conversationsApi.list(params),
  get: (id) => conversationsApi.get(id),
  update: (id, patch) => conversationsApi.update(id, patch),
  markRead: (id) => conversationsApi.markRead(id),
  assignSeller: (id, sellerId) => conversationsApi.assignSeller(id, sellerId),
  archive: (id) => conversationsApi.archive(id),
};
