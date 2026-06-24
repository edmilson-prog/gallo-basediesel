import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IUseReturnToQueueResult {
  /** True while the unassign request is in flight. */
  returning: boolean;
  /** Returns the conversation to the pool/queue (toast w/ undo + audit). */
  returnToQueue: () => Promise<void>;
}

/**
 * Return-to-queue orchestration shared by the QuickActions button and the
 * ConversationMenu item. Unassigns the conversation (staff-only at the RLS
 * layer), shows an undoable toast that restores the prior assignee, and writes a
 * `conversation.return_to_queue` audit entry. Symmetric with useSelfAssign.
 */
export function useReturnToQueue(
  conversation: IConversation,
  opts?: { onDone?: () => void },
): IUseReturnToQueueResult {
  const { currentUser } = useAuth();
  const conversationsProvider = useConversationsProvider();
  const [returning, setReturning] = useState(false);

  const returnToQueue = useCallback(async () => {
    if (!currentUser) return;
    const before = conversation.assignedSellerId;
    setReturning(true);
    try {
      await conversationsProvider.unassign(conversation.id);
      opts?.onDone?.();
      toast(INBOX_STRINGS.returnedToQueue, {
        action: {
          label: INBOX_STRINGS.undo,
          onClick: () => {
            // Nothing to restore if it was already in the pool.
            if (before == null) return;
            void Promise.resolve(
              conversationsProvider.update(conversation.id, { assignedSellerId: before }),
            )
              .then(() => {
                opts?.onDone?.();
                toast.success(INBOX_STRINGS.undone);
              })
              .catch(() => toast.error(INBOX_STRINGS.actionFailed));
          },
        },
        duration: 5_000,
      });
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action: "conversation.return_to_queue",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: null },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    } finally {
      setReturning(false);
    }
  }, [
    conversation.id,
    conversation.assignedSellerId,
    conversation.storeId,
    currentUser,
    conversationsProvider,
    opts,
  ]);

  return { returning, returnToQueue };
}
