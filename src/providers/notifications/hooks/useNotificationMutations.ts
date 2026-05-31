import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ID, INotification } from "@/shared/types";
import { useNotificationSlice } from "./_useNotificationSlice";

export interface IUseNotificationMutationsResult {
  markRead: (id: ID) => Promise<INotification>;
  markAllRead: () => Promise<number>;
  archive: (id: ID) => Promise<void>;
  isMutating: boolean;
}

/**
 * Surfaces the notification store's write operations (mark read / mark all read /
 * archive) to the UI, invalidating the shared `["notifications"]` query prefix so
 * both list views and the unread badge refresh. RBAC scope is resolved inside the
 * store from the authenticated actor — the UI passes no recipientId.
 */
export function useNotificationMutations(): IUseNotificationMutationsResult {
  const store = useNotificationSlice("notifications", "useNotificationMutations");
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markReadMutation = useMutation<INotification, Error, ID>({
    mutationFn: (id: ID) => store.markRead(id),
    onSuccess: invalidate,
  });
  const markAllReadMutation = useMutation<number, Error, void>({
    mutationFn: () => store.markAllRead(),
    onSuccess: invalidate,
  });
  const archiveMutation = useMutation<void, Error, ID>({
    mutationFn: (id: ID) => store.archive(id),
    onSuccess: invalidate,
  });

  return {
    markRead: (id) => markReadMutation.mutateAsync(id),
    markAllRead: () => markAllReadMutation.mutateAsync(),
    archive: (id) => archiveMutation.mutateAsync(id),
    isMutating:
      markReadMutation.isPending || markAllReadMutation.isPending || archiveMutation.isPending,
  };
}
