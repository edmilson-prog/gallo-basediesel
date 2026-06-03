// src/features/vehicle-models/hooks/useVehicleModels.ts
import { useQuery } from "@tanstack/react-query";
import type { IListVehicleModelsParams } from "@/providers/data";
import { useVehicleModelsProvider } from "@/providers/data/hooks/useVehicleModelsProvider";

/** Reads the canonical vehicle-model catalog. Shares the ["vehicle-models"] key family. */
export function useVehicleModels(params: IListVehicleModelsParams = {}) {
  const provider = useVehicleModelsProvider();
  return useQuery({
    queryKey: ["vehicle-models", params] as const,
    queryFn: () => provider.list(params),
  });
}
