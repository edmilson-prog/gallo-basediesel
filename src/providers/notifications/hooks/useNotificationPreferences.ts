import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ID, INotificationPreference, NotificationRecipientType } from "@/shared/types";
import { useNotificationSlice } from "./_useNotificationSlice";

export interface IUseNotificationPreferencesResult {
  preferences: INotificationPreference | undefined;
  isLoading: boolean;
  isError: boolean;
  update: (pref: INotificationPreference) => Promise<INotificationPreference>;
  isUpdating: boolean;
}

/**
 * Reads and updates the notification preference matrix for a given recipient.
 *
 * The `get` call never throws on missing data — the store falls back to the
 * role-based defaults from `preferences/defaults.ts` when no saved preference
 * exists (RF-018).
 *
 * Query key: `["notification-prefs", recipientId]` — stable so the update
 * mutation can invalidate exactly the right cache entry.
 */
export function useNotificationPreferences(
  recipientId: ID,
  recipientType: NotificationRecipientType,
): IUseNotificationPreferencesResult {
  const store = useNotificationSlice("preferences", "useNotificationPreferences");
  const queryClient = useQueryClient();

  const query = useQuery<INotificationPreference>({
    queryKey: ["notification-prefs", recipientId] as const,
    queryFn: () => store.get(recipientId, recipientType),
    staleTime: 60_000,
    enabled: Boolean(recipientId),
  });

  const mutation = useMutation<INotificationPreference, Error, INotificationPreference>({
    mutationFn: (pref) => store.update(pref),
    onSuccess: (updated) => {
      queryClient.setQueryData(["notification-prefs", updated.recipientId], updated);
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    update: (pref) => mutation.mutateAsync(pref),
    isUpdating: mutation.isPending,
  };
}
