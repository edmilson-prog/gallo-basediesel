import type { ID, IConversationParticipant } from "@/shared/types";
import { emitParticipantActivity, getCurrentMockSellerId } from "./_emitConversationActivity";
import { notificationsApi } from "./notifications";
import { runApi } from "./utils";

/**
 * In-memory collaborators — session-only, always starts empty (collaboration
 * is by-demand, never seeded), same convention as
 * `src/providers/data/impl/mock/conversationNotes.ts`. Deliberately NOT wired
 * into `src/mocks/store/mockStore.ts` (no seed/reset story needed for an
 * always-empty collection).
 */
const PARTICIPANTS: IConversationParticipant[] = [];

/** Synchronous read for other mock modules (e.g. `conversations.ts`'s Inbox
 *  filter) — avoids an unnecessary Promise round-trip inside a synchronous
 *  array `.filter()`. */
export function listConversationParticipantsSync(conversationId: ID): IConversationParticipant[] {
  return PARTICIPANTS.filter((p) => p.conversationId === conversationId);
}

/** True when `sellerId` collaborates on `conversationId` (any of the given ids). */
export function sellerCollaboratesOnSync(conversationId: ID, sellerIds: ID[]): boolean {
  if (sellerIds.length === 0) return false;
  const allowed = new Set(sellerIds);
  return PARTICIPANTS.some((p) => p.conversationId === conversationId && allowed.has(p.sellerId));
}

/** Removes every collaborator of a conversation — mirrors
 *  `clear_conversation_participants_on_close` (mock has no DB triggers). */
export function clearConversationParticipantsSync(conversationId: ID): void {
  for (let i = PARTICIPANTS.length - 1; i >= 0; i -= 1) {
    if (PARTICIPANTS[i]?.conversationId === conversationId) PARTICIPANTS.splice(i, 1);
  }
}

export const conversationParticipantsApi = {
  async list(conversationId: ID): Promise<IConversationParticipant[]> {
    return runApi("conversationParticipantsApi", "list", () =>
      listConversationParticipantsSync(conversationId),
    );
  },

  async add(
    conversationId: ID,
    sellerId: ID,
    source: "manual" | "mention",
  ): Promise<IConversationParticipant> {
    return runApi("conversationParticipantsApi", "add", async () => {
      const existing = PARTICIPANTS.find(
        (p) => p.conversationId === conversationId && p.sellerId === sellerId,
      );
      if (existing) return existing;

      const addedBy = getCurrentMockSellerId() ?? undefined;
      const participant: IConversationParticipant = {
        conversationId,
        sellerId,
        addedBy,
        addedAt: new Date().toISOString(),
        source,
      };
      PARTICIPANTS.push(participant);

      // Mirror conversation_participant_activity_capture (attendance history).
      emitParticipantActivity(conversationId, sellerId, "add");

      // Mirrors notify_conversation_participant_added: only the manual path
      // gets a fresh bell notification (mention adds ride the existing
      // note-mention notification instead — see useConversationNotes).
      if (source === "manual") {
        await notificationsApi.create({
          dedupeKey: `conv-participant-${conversationId}-${sellerId}`,
          lifecycle: "event",
          type: "conversa.colaboradorAdicionado",
          category: "operational",
          severity: "info",
          recipientId: sellerId,
          recipientType: "seller",
          title: "Você foi adicionado a uma conversa",
          entityRef: { type: "conversation", id: conversationId },
          channels: ["inApp"],
          source: "rule",
        });
      }

      return participant;
    });
  },

  async remove(conversationId: ID, sellerId: ID): Promise<void> {
    return runApi("conversationParticipantsApi", "remove", () => {
      const idx = PARTICIPANTS.findIndex(
        (p) => p.conversationId === conversationId && p.sellerId === sellerId,
      );
      if (idx >= 0) {
        PARTICIPANTS.splice(idx, 1);
        // Mirror conversation_participant_activity_capture (attendance history).
        emitParticipantActivity(conversationId, sellerId, "remove");
      }
    });
  },
};
