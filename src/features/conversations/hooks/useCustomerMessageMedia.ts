import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useMessagesProvider } from "@/providers/data";
import { messageToMediaItem, type IConversationMediaItem } from "../engine/conversationMedia";

export interface IUseCustomerMessageMedia {
  items: IConversationMediaItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Media across ALL of a customer's conversations, derived from messages (not
 * the Vault's media_assets). Powers the customer fiche "Mídias" tab. Returns
 * only items with bytes available, newest first.
 */
export function useCustomerMessageMedia(customerId: ID, enabled = true): IUseCustomerMessageMedia {
  const provider = useMessagesProvider();
  const query = useQuery({
    queryKey: ["customer-message-media", customerId],
    queryFn: () => provider.listCustomerMedia(customerId),
    enabled: enabled && Boolean(customerId),
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
