import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IUseSelfAssignResult {
  /** True while the assign request is in flight. */
  assigning: boolean;
  /** Whether the user can self-assign: has a seller identity AND the conversation is in the pool. */
  canSelfAssign: boolean;
  /** Assigns the conversation to the current user (toast w/ undo + audit). */
  selfAssign: () => Promise<void>;
}

/**
 * Self-assign orchestration shared by the QuickActions button and the
 * MessageInput "assumir e responder" banner. Mirrors the previous inline
 * QuickActions behaviour: assignSeller, an undoable toast that restores the
 * prior assignee, and a `conversation.self_assign` audit entry.
 */
export function useSelfAssign(
  conversation: IConversation,
  opts?: { onDone?: () => void },
): IUseSelfAssignResult {
  const { currentUser } = useAuth();
  const conversationsProvider = useConversationsProvider();
  const [assigning, setAssigning] = useState(false);

  const canSelfAssign =
    currentUser?.sellerId != null && conversation.assignedSellerId == null;

  const selfAssign = useCallback(async () => {
    if (!currentUser?.sellerId) return;
    const sellerId = currentUser.sellerId;
    const before = conversation.assignedSellerId;
    setAssigning(true);
    try {
      await conversationsProvider.assignSeller(conversation.id, sellerId);
      opts?.onDone?.();
      toast(INBOX_STRINGS.assignedToYou, {
        action: {
          label: INBOX_STRINGS.undo,
          onClick: () => {
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
        action: "conversation.self_assign",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: sellerId },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    } finally {
      setAssigning(false);
    }
  }, [
    conversation.id,
    conversation.assignedSellerId,
    conversation.storeId,
    currentUser,
    conversationsProvider,
    opts,
  ]);

  return { assigning, canSelfAssign, selfAssign };
}
