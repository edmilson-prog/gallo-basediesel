import { sdrSessionsApi } from "@/mocks";
import type { ISdrSessionsProvider } from "../../contracts/sdrSessions";

export const mockSdrSessionsProvider: ISdrSessionsProvider = {
  list: (params) => sdrSessionsApi.list(params),
  listActive: () => sdrSessionsApi.listActive(),
  getByConversation: (conversationId) => sdrSessionsApi.getByConversation(conversationId),
  upsert: (session) => sdrSessionsApi.upsert(session),
  patch: (id, patch) => sdrSessionsApi.patch(id, patch),
  pause: (id, now) => sdrSessionsApi.pause(id, now),
  resume: (id, now) => sdrSessionsApi.resume(id, now),
};
