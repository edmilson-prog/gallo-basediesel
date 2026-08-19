import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { mergeBrandOptions } from "../utils/vehicleBrands";

export interface IVehicleBrandOptions {
  /** Brands to offer, DB-derived and merged with the static fallback. */
  brands: string[];
  isLoading: boolean;
}

/**
 * Brand options for the Marca pickers, derived from the brands actually
 * present in the database rather than a hard-coded list — so a marque that
 * arrives with a future import shows up without a code change.
 *
 * The static fallback is merged in, never replaced: the picker is populated on
 * first paint and stays usable if the query fails. Cached for five minutes —
 * the brand vocabulary changes on the order of imports, not interactions.
 *
 * @see ../utils/vehicleBrands
 */
export function useVehicleBrandOptions(): IVehicleBrandOptions {
  const provider = useVehiclesProvider();

  const query = useQuery({
    queryKey: ["vehicle-brands"] as const,
    queryFn: () => provider.listBrands(),
    staleTime: 5 * 60_000,
  });

  const brands = useMemo(() => mergeBrandOptions(query.data), [query.data]);

  return { brands, isLoading: query.isLoading };
}
