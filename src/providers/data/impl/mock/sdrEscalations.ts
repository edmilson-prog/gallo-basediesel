import { sdrEscalationsApi } from "@/mocks";
import type { ISdrEscalationsProvider } from "../../contracts/sdrEscalations";

export const mockSdrEscalationsProvider: ISdrEscalationsProvider = {
  list: (params) => sdrEscalationsApi.list(params),
  getById: (id) => sdrEscalationsApi.getById(id),
  getByConversation: (conversationId) => sdrEscalationsApi.getByConversation(conversationId),
  create: (escalation) => sdrEscalationsApi.create(escalation),
  patch: (id, patch) => sdrEscalationsApi.patch(id, patch),
};
