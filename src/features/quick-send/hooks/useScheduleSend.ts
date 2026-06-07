import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IConversation, ISO8601, IScheduledSend } from "@/shared/types";
import { useScheduledSendProvider } from "@/providers/data";
import { scheduledSendsQueryKey } from "./useConversationScheduled";

export interface IScheduleSendPayload {
  type: "asset" | "snippet" | "combo" | "product";
  assetIds?: ID[];
  quickReplyId?: ID;
  productId?: ID;
  contextMessage?: string;
}

export interface IUseScheduleSendResult {
  schedule: (scheduledFor: ISO8601, payload: IScheduleSendPayload) => Promise<IScheduledSend>;
}

/**
 * Persists a scheduled send for the current conversation, then invalidates the
 * per-conversation query so `ScheduledList` and the header count refresh. The
 * runner (Task 5) fires it at the simulated time, re-validating on dispatch.
 */
export function useScheduleSend(conversation: IConversation): IUseScheduleSendResult {
  const provider = useScheduledSendProvider();
  const queryClient = useQueryClient();

  const schedule = useCallback(
    async (scheduledFor: ISO8601, payload: IScheduleSendPayload) => {
      const created = await provider.create({
        conversationId: conversation.id,
        scheduledFor,
        payload,
        createdBy: conversation.assignedSellerId ?? "system",
      });
      void queryClient.invalidateQueries({
        queryKey: scheduledSendsQueryKey(conversation.id),
      });
      return created;
    },
    [provider, conversation.id, conversation.assignedSellerId, queryClient],
  );

  return { schedule };
}
