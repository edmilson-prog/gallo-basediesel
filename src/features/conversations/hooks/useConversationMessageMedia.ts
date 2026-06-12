import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useMessagesProvider } from "@/providers/data";
import { messageToMediaItem, type IConversationMediaItem } from "../engine/conversationMedia";

export interface IUseConversationMessageMedia {
  items: IConversationMediaItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Media of a conversation derived from its messages (not the Vault's
 * media_assets). Returns only items with bytes available, newest first.
 */
export function useConversationMessageMedia(
  conversationId: ID,
  enabled = true,
): IUseConversationMessageMedia {
  const provider = useMessagesProvider();
  const query = useQuery({
    queryKey: ["conversation-message-media", conversationId],
    queryFn: () => provider.listConversationMedia(conversationId),
    enabled: enabled && Boolean(conversationId),
    staleTime: 30_000,
  });
  const items = (query.data ?? [])
    .map(messageToMediaItem)
    .filter((item): item is IConversationMediaItem => item !== null);
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
