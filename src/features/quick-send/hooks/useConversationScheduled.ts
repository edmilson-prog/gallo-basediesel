import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IScheduledSend } from "@/shared/types";
import { useScheduledSendProvider, getActiveDataSource } from "@/providers/data";

/** Query key factory so the runner (Task 5) and the list stay in sync. */
export function scheduledSendsQueryKey(conversationId: ID): readonly unknown[] {
  return ["quick-send", "scheduled", conversationId] as const;
}

export interface IUseConversationScheduledResult {
  items: IScheduledSend[];
  cancel: (id: ID) => void;
  update: (id: ID, patch: Partial<IScheduledSend>) => void;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Per-conversation scheduled-send list for `ScheduledList`. Reads via
 * `IScheduledSendProvider.list`; cancel/update mutate then invalidate so the
 * collapsible bar and the runner observe the same source of truth (D-11).
 */
export function useConversationScheduled(conversationId: ID): IUseConversationScheduledResult {
  const provider = useScheduledSendProvider();
  const queryClient = useQueryClient();
  const key = scheduledSendsQueryKey(conversationId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => provider.list(conversationId),
    // Pending sends rarely change outside our own mutations; keep it cheap.
    staleTime: 5_000,
    // In supabase the server worker (scheduled-send-worker) owns dispatch, so
    // nothing client-side invalidates when a send fires. Poll lightly while
    // something is still pending so the bar/badge reflect sent/failed; stop once
    // none are pending. Mock keeps no polling (its runner invalidates directly).
    refetchInterval:
      getActiveDataSource() === "supabase"
        ? (q) =>
            (q.state.data ?? []).some((s) => s.status === "pending") ? 30_000 : false
        : false,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const cancelMutation = useMutation({
    mutationFn: (id: ID) => provider.cancel(id),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: ID; patch: Partial<IScheduledSend> }) =>
      provider.update(id, patch),
    onSuccess: invalidate,
  });

  const cancel = useCallback((id: ID) => cancelMutation.mutate(id), [cancelMutation]);
  const update = useCallback(
    (id: ID, patch: Partial<IScheduledSend>) => updateMutation.mutate({ id, patch }),
    [updateMutation],
  );

  return {
    items: query.data ?? [],
    cancel,
    update,
    isLoading: query.isLoading,
    isError: query.isError,
    // intentionally narrow surface (CONTRACT §C)
  };
}
