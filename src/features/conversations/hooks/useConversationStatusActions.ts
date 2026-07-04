import { useState } from "react";
import { toast } from "sonner";
import type { ConversationStatus, IConversation } from "@/shared/types";
import {
  coupleManualStatusChange,
  recordAuditLog,
  statusOnAssign,
  statusOnUnassign,
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
      // queue. Route through the semantic provider ops (assignSeller/unassign)
      // so status transitions, the is_sdr_active reset and the RLS paths stay
      // identical to QuickActions' claim/return actions.
      const decision = coupleManualStatusChange(next, beforeAssignee != null);
      let afterAssignee = beforeAssignee;
      let coupledToast: string | null = null;
      if (decision === "assign-self" && currentUser.sellerId) {
        await conversationsProvider.assignSeller(conversation.id, currentUser.sellerId);
        // assignSeller lands on statusOnAssign(before) (aguardando -> em_andamento,
        // otherwise unchanged); align to the picked status when they differ.
        const landed = statusOnAssign(before) ?? before;
        if (landed !== next) {
          await conversationsProvider.update(conversation.id, { status: next });
        }
        afterAssignee = currentUser.sellerId;
        coupledToast = CONVERSATION_STRINGS.statusControl.autoAssignedToYou;
      } else if (decision === "unassign") {
        // unassign already re-queues the status; the archive axis is engine-
        // protected, so align explicitly when the landing status differs.
        await conversationsProvider.unassign(conversation.id);
        const landed = statusOnUnassign(before) ?? before;
        if (landed !== next) {
          await conversationsProvider.update(conversation.id, { status: next });
        }
        afterAssignee = null;
        coupledToast = CONVERSATION_STRINGS.statusControl.autoReturnedToQueue;
      } else if (decision === "close") {
        // Closing an owned conversation (→ resolvida/arquivada) is an atomic
        // server op: terminal status + unassign + SDR reset in one call, no
        // transitional "aguardando" (spec 2026-07-03-attendance-close).
        await conversationsProvider.close(conversation.id, next as "resolvida" | "arquivada");
        afterAssignee = null;
        coupledToast = CONVERSATION_STRINGS.statusControl.closedAndRemoved;
      } else {
        await conversationsProvider.update(conversation.id, { status: next });
      }
      onChanged?.();
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action,
        resource: "conversation",
        resourceId: conversation.id,
        before: { status: before, assignedSellerId: beforeAssignee },
        after: { status: next, assignedSellerId: afterAssignee },
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
