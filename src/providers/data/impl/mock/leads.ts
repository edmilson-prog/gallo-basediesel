import { conversationsApi, leadsApi } from "@/mocks";
import type { ILeadsProvider } from "../../contracts/leads";
import { assertImmutableStoreId, scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockLeadsProvider: ILeadsProvider = {
  list: (params) => leadsApi.list(scopedListParams(params, "lead")),
  get: (id) => leadsApi.get(id),
  // Mock mirror of the conversation-gated RPC: resolve the conversation, then
  // its lead. Fail-soft to null on either miss — same contract as supabase.
  getViaConversation: async (conversationId) => {
    const conversation = await conversationsApi.get(conversationId).catch(() => null);
    if (!conversation?.leadId) return null;
    return leadsApi.get(conversation.leadId).catch(() => null);
  },
  listNotes: (leadId) => leadsApi.listNotes(leadId),
  addNote: (leadId, content, authorId) => leadsApi.addNote(leadId, content, authorId),
  create: (input) => leadsApi.create(withCreateStoreId(input)),
  update: async (id, patch) => {
    const before = await leadsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return leadsApi.update(id, patch);
  },
  delete: (id) => leadsApi.delete(id),
};
