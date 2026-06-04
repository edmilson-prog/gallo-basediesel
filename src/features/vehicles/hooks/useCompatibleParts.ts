// src/features/vehicles/hooks/useCompatibleParts.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPart, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { useVehicleModels } from "@/features/vehicle-models/hooks/useVehicleModels";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { findKitsForVehicle } from "@/features/model-kits/utils/modelKitMatching";
import { findCompatibleParts, splitByKitMembership } from "../utils/compatibleParts";

export interface IUseCompatibleParts {
  isLoading: boolean;
  model: IVehicleModel | null;
  parts: IPart[];
  inKit: IPart[];
  drift: IPart[];
  applicableKit: IVehicleModelKit | null;
}

/** Resolves compatible parts + applicable filter kit + drift split for a vehicle. */
export function useCompatibleParts(vehicle: IVehicle): IUseCompatibleParts {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts", "compatible-slice"],
    queryFn: async () => (await partsProvider.list({ pageSize: 1000, active: true })).data,
    staleTime: 60_000,
  });
  const vehicleModelsQuery = useVehicleModels({});
  const modelKitsQuery = useModelKits({});

  const allParts = partsQuery.data ?? [];
  const models = vehicleModelsQuery.data ?? [];
  const kits = modelKitsQuery.data ?? [];

  const model = useMemo(
    () => (vehicle.modelId ? (models.find((m) => m.id === vehicle.modelId) ?? null) : null),
    [vehicle.modelId, models],
  );

  const applicableKit = useMemo(
    () =>
      findKitsForVehicle(vehicle, kits).find(
        (k) => k.status === "oficial" && k.category === "filtros",
      ) ?? null,
    [vehicle, kits],
  );

  const parts = useMemo(
    () => findCompatibleParts(vehicle, model, allParts),
    [vehicle, model, allParts],
  );

  const { inKit, drift } = useMemo(
    () => splitByKitMembership(parts, applicableKit),
    [parts, applicableKit],
  );

  return {
    isLoading: partsQuery.isLoading || vehicleModelsQuery.isLoading || modelKitsQuery.isLoading,
    model,
    parts,
    inKit,
    drift,
    applicableKit,
  };
}
