import { useQuery } from "@tanstack/react-query";
import type { ID, IConversationTag } from "@/shared/types";
import { useConversationTagsProvider } from "@/providers/data";

const STALE_MS = 30 * 60 * 1000; // catalog changes rarely — mirror useConversationTags

/**
 * The store's conversation-tag catalog, reused as the lead tag vocabulary.
 * Returns every tag (archived included) so already-applied archived tags still
 * render with their colour; the picker filters to active tags for adding.
 * Shares the `["conversation-tags", storeId]` cache with the Atendimento hook.
 */
export function useLeadTagCatalog(storeId: ID): IConversationTag[] {
  const provider = useConversationTagsProvider();
  const query = useQuery({
    queryKey: ["conversation-tags", storeId] as const,
    queryFn: () => provider.list({ storeId }),
    staleTime: STALE_MS,
  });
  return query.data ?? [];
}
