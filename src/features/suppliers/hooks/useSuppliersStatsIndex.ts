import { useQuery } from "@tanstack/react-query";
import type { ID, ISupplierStats } from "@/shared/types";
import { useSuppliersProvider } from "@/providers/data";

/**
 * Stats for the whole visible list, as one query keyed by the id set.
 *
 * `stats` costs a catalog scan per supplier on the Supabase impl, so this is
 * only enabled while a column that needs it is visible — the same discipline
 * the catalog list applies to its turnover column.
 */
export function useSuppliersStatsIndex(ids: ID[], enabled: boolean) {
  const provider = useSuppliersProvider();
  const key = ids.join(",");

  const query = useQuery({
    queryKey: ["suppliers", "stats", key] as const,
    queryFn: async () => {
      const entries = await Promise.all(
        ids.map(async (id) => [id, await provider.stats(id)] as const),
      );
      return new Map<ID, ISupplierStats>(entries);
    },
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
  });

  return { index: query.data ?? null, isLoading: query.isLoading };
}
