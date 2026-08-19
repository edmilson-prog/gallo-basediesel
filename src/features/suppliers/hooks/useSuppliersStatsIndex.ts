import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useSuppliersProvider } from "@/providers/data";

/**
 * Stats for the whole visible list, as one query keyed by the id set.
 *
 * Calls `statsMany` ONCE for the whole id set rather than `Promise.all`-ing
 * `stats` per supplier: on the Supabase impl the latter cost 2 requests and a
 * full (silently truncated, since PostgREST caps a request at 1000 rows)
 * catalog scan PER supplier — ~252 requests and ~126.000 part rows read for a
 * 126-supplier list. `statsMany` makes one paginated pass over the catalog
 * shared by every id instead. Still gated behind column visibility — the
 * same discipline the catalog list applies to its turnover column — since
 * even one scan is wasted work when no column needs it.
 */
export function useSuppliersStatsIndex(ids: ID[], enabled: boolean) {
  const provider = useSuppliersProvider();
  const key = ids.join(",");

  const query = useQuery({
    queryKey: ["suppliers", "stats", key] as const,
    queryFn: () => provider.statsMany(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
  });

  return { index: query.data ?? null, isLoading: query.isLoading };
}
