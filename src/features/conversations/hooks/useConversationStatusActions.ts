import { useState } from "react";
import { toast } from "sonner";
import type { ConversationStatus, IConversation } from "@/shared/types";
import {
  coupleManualStatusChange,
  recordAuditLog,
  useConversationsProvider,
} from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export function useConversationStatusActions(
  conversation: IConversation,
  onChanged?: () => void,
): {
  setStatus: (next: ConversationStatus, action?: string) => Promise<void>;
  isPending: boolean;
} {
  const conversationsProvider = useConversationsProvider();
  const { currentUser } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const setStatus = async (next: ConversationStatus, action = "conversation.status_change") => {
    const before = conversation.status;
    const beforeAssignee = conversation.assignedSellerId ?? null;
    if (!currentUser || next === before || isPending) return;
    setIsPending(true);
    try {
      // Coupling (spec 2026-07-02): an "owned" status on an unowned conversation
      // claims it for the actor; "aguardando" on an owned one returns it to the
      // queue. RLS: claim = null->self arm; unassign = new-row-null arm.
      const decision = coupleManualStatusChange(next, beforeAssignee != null);
      const patch: Partial<IConversation> = { status: next };
      let coupledToast: string | null = null;
      if (decision === "assign-self" && currentUser.sellerId) {
        patch.assignedSellerId = currentUser.sellerId;
        coupledToast = CONVERSATION_STRINGS.statusControl.autoAssignedToYou;
      } else if (decision === "unassign") {
        patch.assignedSellerId = null;
        coupledToast = CONVERSATION_STRINGS.statusControl.autoReturnedToQueue;
      }
      await conversationsProvider.update(conversation.id, patch);
      onChanged?.();
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action,
        resource: "conversation",
        resourceId: conversation.id,
        before: { status: before, assignedSellerId: beforeAssignee },
        after: { status: next, assignedSellerId: patch.assignedSellerId ?? beforeAssignee },
      });
      toast.success(
        CONVERSATION_STRINGS.statusControl.statusChanged(CONVERSATION_STRINGS.statusLabel[next]),
      );
      if (coupledToast) toast.info(coupledToast);
    } catch {
      toast.error(CONVERSATION_STRINGS.statusControl.actionFailed);
    } finally {
      setIsPending(false);
    }
  };

  return { setStatus, isPending };
}
