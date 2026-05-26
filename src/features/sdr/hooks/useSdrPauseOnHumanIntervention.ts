import { useCallback } from "react";
import type { IConversation, IMessage } from "@/shared/types";
import {
  useConversationsProvider,
  useSdrSessionsProvider,
  recordAuditLogSync,
} from "@/providers/data";

/**
 * Hook that records human intervention on an SDR-driven conversation. Call
 * after a seller successfully sends a message in a conversation flagged
 * `isSdrActive=true`. Pause is sagrada — never blocks the underlying send,
 * just toggles the conversation flag and marks the session.
 *
 * On Fase 2 this becomes a database trigger; the API surface here mirrors what
 * Supabase will expose so consumers don't change.
 */
export function useSdrPauseOnHumanIntervention() {
  const conversationsProvider = useConversationsProvider();
  const sessionsProvider = useSdrSessionsProvider();

  const handleSellerMessage = useCallback(
    async (conversation: IConversation, message: IMessage): Promise<void> => {
      if (!conversation.isSdrActive) return;
      if (message.authorType !== "seller") return;

      try {
        await conversationsProvider.update(conversation.id, { isSdrActive: false });
        const session = await sessionsProvider.getByConversation(conversation.id);
        if (session && session.state !== "pausado") {
          await sessionsProvider.pause(session.id);
        }
        recordAuditLogSync({
          storeId: conversation.storeId,
          actorId: message.authorId ?? "system",
          action: "sdr_paused_by_human",
          resource: "conversation",
          resourceId: conversation.id,
        });
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[sdr] failed to pause SDR on human intervention", err);
        }
      }
    },
    [conversationsProvider, sessionsProvider],
  );

  return { handleSellerMessage };
}

/** Reactivate a paused SDR session and re-flag the conversation. */
export function useSdrReactivate() {
  const conversationsProvider = useConversationsProvider();
  const sessionsProvider = useSdrSessionsProvider();

  const reactivate = useCallback(
    async (conversation: IConversation): Promise<void> => {
      const session = await sessionsProvider.getByConversation(conversation.id);
      if (session && session.state === "pausado") {
        await sessionsProvider.resume(session.id);
      }
      await conversationsProvider.update(conversation.id, { isSdrActive: true });
      recordAuditLogSync({
        storeId: conversation.storeId,
        actorId: "system",
        action: "sdr_reactivated",
        resource: "conversation",
        resourceId: conversation.id,
      });
    },
    [conversationsProvider, sessionsProvider],
  );

  return { reactivate };
}
