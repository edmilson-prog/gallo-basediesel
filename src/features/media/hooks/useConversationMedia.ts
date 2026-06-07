// src/features/media/hooks/useConversationMedia.ts
import { useQuery } from "@tanstack/react-query";
import type { ID, IMediaAsset } from "@/shared/types";
import { useMediaStorageProvider } from "@/providers/data";

export interface IUseConversationMedia {
  assets: IMediaAsset[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** All media assets bound to a single conversation (scope=conversation). */
export function useConversationMedia(conversationId: ID, enabled = true): IUseConversationMedia {
  const provider = useMediaStorageProvider();
  const query = useQuery({
    queryKey: ["media", "conversation", conversationId],
    queryFn: () => provider.list({ conversationId }),
    enabled: enabled && Boolean(conversationId),
    staleTime: 30_000,
  });
  return {
    assets: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
