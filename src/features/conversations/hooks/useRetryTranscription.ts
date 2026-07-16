import { useMutation } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useMessagesProvider } from "@/providers/data";

/**
 * Thin mutation wrapper over `IMessagesProvider.retryTranscription`. No cache
 * invalidation on success: the Edge Function's UPDATE on `messages` arrives via
 * the existing Realtime channel (useRealtimeMessages), which already patches
 * the bubble in place — same mechanism as delivery-status updates.
 */
export function useRetryTranscription() {
  const messages = useMessagesProvider();
  const mutation = useMutation({
    mutationFn: (messageId: ID) => messages.retryTranscription(messageId),
  });
  return {
    retry: mutation.mutate,
    isPending: mutation.isPending,
    pendingMessageId: (mutation.variables as ID | undefined) ?? null,
  };
}
