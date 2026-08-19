import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useSuppliersProvider } from "@/providers/data";

/**
 * Stats for exactly ONE supplier — the "Ficha completa" sheet's own fetch,
 * deliberately separate from `useSuppliersStatsIndex`'s list-wide batch.
 *
 * The batch hook is gated behind column visibility because `stats` costs a
 * catalog scan per supplier on the Supabase impl (~125 suppliers in
 * production) — fine to pay once for a visible column, wrong to pay for the
 * whole list just to populate one drawer. This hook lets the sheet always
 * resolve its loading state (never hangs on a permanently-disabled batch
 * query) at O(1) cost instead of O(list length).
 */
export function useSupplierStats(id: ID | null, enabled: boolean) {
  const provider = useSuppliersProvider();

  const query = useQuery({
    queryKey: ["suppliers", "stats", "single", id] as const,
    queryFn: () => provider.stats(id as ID),
    enabled: enabled && id !== null,
    staleTime: 5 * 60_000,
  });

  return { stats: query.data ?? null, isLoading: query.isLoading };
}
