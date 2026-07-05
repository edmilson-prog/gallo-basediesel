import { conversationParticipantsApi } from "@/mocks";
import type { ID } from "@/shared/types";
import type { IConversationParticipantsProvider } from "../../contracts/conversationParticipants";

/** Thin mock delegator — all logic lives in `conversationParticipantsApi`
 *  (same split as `impl/mock/rotationParticipants.ts` → `rotationParticipantsApi`). */
export const mockConversationParticipantsProvider: IConversationParticipantsProvider = {
  list: (conversationId: ID) => conversationParticipantsApi.list(conversationId),
  add: (conversationId: ID, sellerId: ID, source: "manual" | "mention") =>
    conversationParticipantsApi.add(conversationId, sellerId, source),
  remove: (conversationId: ID, sellerId: ID) =>
    conversationParticipantsApi.remove(conversationId, sellerId),
};
