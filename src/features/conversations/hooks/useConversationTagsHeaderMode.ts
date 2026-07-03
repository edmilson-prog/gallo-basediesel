import { useQuery } from "@tanstack/react-query";
import type { ConversationTagsHeaderMode } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";

const STALE_MS = 30 * 60 * 1000;

/**
 * Reads the Owner-configured header layout for conversation tags. Shares the
 * ["platform-settings", storeId] cache with TagsCard (same key + staleTime).
 */
export function useConversationTagsHeaderMode(): ConversationTagsHeaderMode {
  const settingsProvider = useSettingsProvider();
  const { currentStoreId } = useCurrentStore();
  const { data } = useQuery({
    queryKey: ["platform-settings", currentStoreId],
    queryFn: () => settingsProvider.get(currentStoreId!),
    enabled: !!currentStoreId,
    staleTime: STALE_MS,
  });
  return data?.conversationTags?.headerMode ?? "readonly";
}
