import { useQuery } from "@tanstack/react-query";
import { useSettingsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { resolveMaxPinned } from "../engine/pinPolicy";

const STALE_MS = 30 * 60 * 1000;

/**
 * Owner-configured cap of pinned conversations for the store. Shares the
 * ["platform-settings", storeId] cache with TagsCard and
 * useConversationTagsHeaderMode (same key + staleTime), so it costs the Inbox
 * no extra request.
 */
export function useInboxPinsLimit(): number {
  const settingsProvider = useSettingsProvider();
  const { currentStoreId } = useCurrentStore();
  const { data } = useQuery({
    queryKey: ["platform-settings", currentStoreId],
    queryFn: () => settingsProvider.get(currentStoreId!).catch(() => null),
    enabled: !!currentStoreId,
    staleTime: STALE_MS,
  });
  return resolveMaxPinned(data?.inboxPins?.maxPinned);
}
