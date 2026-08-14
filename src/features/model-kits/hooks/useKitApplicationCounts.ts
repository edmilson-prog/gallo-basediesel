import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useModelKitsProvider } from "@/providers/data";

/**
 * How many quotes applied each kit, keyed by kit id. Aggregated from
 * `IQuote.appliedKitIds`, so the number reflects the quotes the current user can
 * read. Kits never applied are absent from the map.
 */
export function useKitApplicationCounts(kitIds: ID[]) {
  const provider = useModelKitsProvider();
  // Stable key: the same set of kits in any order must hit the same cache entry.
  const sortedIds = useMemo(() => [...kitIds].sort(), [kitIds]);

  return useQuery({
    queryKey: ["model-kit-applications", sortedIds] as const,
    queryFn: () => provider.applicationCounts(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: 60_000,
  });
}
