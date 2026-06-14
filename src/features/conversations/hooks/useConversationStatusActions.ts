import { useState } from "react";
import { toast } from "sonner";
import type { ConversationStatus, IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
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
    if (!currentUser || next === before || isPending) return;
    setIsPending(true);
    try {
      await conversationsProvider.update(conversation.id, { status: next });
      onChanged?.();
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action,
        resource: "conversation",
        resourceId: conversation.id,
        before: { status: before },
        after: { status: next },
      });
      toast.success(
        CONVERSATION_STRINGS.statusControl.statusChanged(CONVERSATION_STRINGS.statusLabel[next]),
      );
    } catch {
      toast.error(CONVERSATION_STRINGS.statusControl.actionFailed);
    } finally {
      setIsPending(false);
    }
  };

  return { setStatus, isPending };
}
