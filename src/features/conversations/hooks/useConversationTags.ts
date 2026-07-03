import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversationTag } from "@/shared/types";
import { useConversationTagsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";

const STALE_MS = 30 * 60 * 1000; // catalog changes rarely — mirror platform-settings

export interface IUseConversationTagsResult {
  tags: IConversationTag[];
  /** Non-archived tags — what pickers and the create-flow offer. */
  activeTags: IConversationTag[];
  byId: Map<ID, IConversationTag>;
  isLoading: boolean;
}

export function useConversationTags(): IUseConversationTagsResult {
  const provider = useConversationTagsProvider();
  const { currentStoreId } = useCurrentStore();
  const query = useQuery({
    queryKey: ["conversation-tags", currentStoreId],
    queryFn: () => provider.list({ storeId: currentStoreId ?? undefined }),
    staleTime: STALE_MS,
  });

  const tags = useMemo(() => query.data ?? [], [query.data]);
  const activeTags = useMemo(() => tags.filter((t) => !t.archived), [tags]);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  return { tags, activeTags, byId, isLoading: query.isLoading };
}
