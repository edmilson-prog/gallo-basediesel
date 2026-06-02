// src/features/quotes/hooks/useItemSearch.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPart, IVehicle } from "@/shared/types";
import { searchPartsByApplication, searchPartsByText } from "@/features/catalog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";

export interface IUseItemSearchArgs {
  enabled: boolean;
  query: string;
  /** When set, pre-filter by this vehicle's application before text search. */
  vehicle?: IVehicle | null;
  limit?: number;
}

export interface IUseItemSearch {
  results: IPart[];
  allParts: IPart[];
  isLoading: boolean;
}

/** Shared catalog search for the quote item adders. */
export function useItemSearch({
  enabled,
  query,
  vehicle,
  limit = 20,
}: IUseItemSearchArgs): IUseItemSearch {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts-for-quote"] as const,
    queryFn: async () => (await partsProvider.list({ pageSize: 1000, active: true })).data,
    enabled,
    staleTime: 60_000,
  });

  const allParts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);

  const results = useMemo(() => {
    let candidates = allParts;
    if (vehicle) {
      candidates = searchPartsByApplication(candidates, {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
      });
    }
    if (query.trim()) candidates = searchPartsByText(candidates, query);
    return candidates.slice(0, limit);
  }, [allParts, vehicle, query, limit]);

  return { results, allParts, isLoading: partsQuery.isLoading };
}
