import { useQuery } from "@tanstack/react-query";
import type { ID, ITrackableLink } from "@/shared/types";
import { useTrackableLinkProvider } from "@/providers/data";

export function conversationLinksQueryKey(conversationId: ID): readonly unknown[] {
  return ["quick-send", "links", conversationId] as const;
}

/** Live trackable links of a conversation, keyed for the open-simulation runner. */
export function useConversationLinks(conversationId: ID): {
  links: ITrackableLink[];
  byId: Map<ID, ITrackableLink>;
  isLoading: boolean;
  isError: boolean;
} {
  const provider = useTrackableLinkProvider();
  const query = useQuery({
    queryKey: conversationLinksQueryKey(conversationId),
    queryFn: () => provider.listByConversation(conversationId),
    staleTime: 5_000,
  });
  const links = query.data ?? [];
  const byId = new Map<ID, ITrackableLink>(links.map((l) => [l.id, l]));
  return { links, byId, isLoading: query.isLoading, isError: query.isError };
}
