import { useQuery } from "@tanstack/react-query";
import type { ID, ISO8601 } from "@/shared/types";
import { useAssetLibraryProvider } from "@/providers/data";

/**
 * Foundation data hook for the management usage stats (PRD-027 D-13, RF-025).
 * Reads the simulated usage ledger via the asset library provider (the only
 * layer allowed to bridge `@/mocks`). The `from`/`to` params are accepted for
 * forward-compatibility; the Fase 1 mock aggregates all recorded sends
 * regardless of window.
 */
export function useAssetUsageStats(params?: { from?: ISO8601; to?: ISO8601 }): {
  topAssets: { assetId: ID; title: string; count: number }[];
  bySeller: { sellerId: ID; count: number }[];
  isLoading: boolean;
  isError: boolean;
} {
  const provider = useAssetLibraryProvider();
  const statsQuery = useQuery({
    queryKey: ["quick-send", "usage-stats", params?.from ?? null, params?.to ?? null],
    queryFn: () => provider.getUsageStats(params),
  });

  return {
    topAssets: statsQuery.data?.topAssets ?? [],
    bySeller: statsQuery.data?.bySeller ?? [],
    isLoading: statsQuery.isLoading,
    isError: statsQuery.isError,
  };
}
