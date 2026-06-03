// src/features/vehicle-models/hooks/useVehicleModel.ts
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useVehicleModelsProvider } from "@/providers/data/hooks/useVehicleModelsProvider";

/** Reads a single vehicle model by id. */
export function useVehicleModel(id: ID | undefined) {
  const provider = useVehicleModelsProvider();
  return useQuery({
    queryKey: ["vehicle-models", "detail", id] as const,
    queryFn: () => provider.get(id as ID),
    enabled: !!id,
  });
}
