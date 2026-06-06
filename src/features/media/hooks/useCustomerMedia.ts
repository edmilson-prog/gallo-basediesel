// src/features/media/hooks/useCustomerMedia.ts
import { useQuery } from "@tanstack/react-query";
import type { ID, IMediaAsset } from "@/shared/types";
import { useMediaStorageProvider } from "@/providers/data";

export interface IUseCustomerMedia {
  assets: IMediaAsset[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Aggregated media for a customer across all their conversations
 * (scope=customer). The provider filters by customerId server-side
 * (Fase 2) / in the mock store today; assets carry customerId directly
 * (spec §4), so no extra join is needed.
 */
export function useCustomerMedia(customerId: ID, enabled = true): IUseCustomerMedia {
  const provider = useMediaStorageProvider();
  const query = useQuery({
    queryKey: ["media", "customer", customerId],
    queryFn: () => provider.list({ customerId }),
    enabled: enabled && Boolean(customerId),
    staleTime: 30_000,
  });
  return {
    assets: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
