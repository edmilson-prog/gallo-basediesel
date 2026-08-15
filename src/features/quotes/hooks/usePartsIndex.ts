// src/features/quotes/hooks/usePartsIndex.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";

export interface IUsePartsIndex {
  /** Lookup by part id — resolves the IPart behind a quote item's partId. */
  partsById: Map<ID, IPart>;
  /** Flat list (needed to resolve equivalents via getEquivalents). */
  allParts: IPart[];
  isLoading: boolean;
}

/**
 * Provides the full active catalog indexed by id, for enriching quote item
 * lines. Shares the `["parts-for-quote"]` query with `useItemSearch`.
 */
export function usePartsIndex(enabled = true): IUsePartsIndex {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts-for-quote"] as const,
    queryFn: async () =>
      (await partsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true })).data,
    enabled,
    staleTime: 60_000,
  });

  const allParts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);
  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    for (const p of allParts) map.set(p.id, p);
    return map;
  }, [allParts]);

  return { partsById, allParts, isLoading: partsQuery.isLoading };
}
