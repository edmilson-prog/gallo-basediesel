// src/features/vehicles/hooks/useCompatibleParts.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPart, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { useVehicleModels } from "@/features/vehicle-models/hooks/useVehicleModels";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { findKitsForVehicle } from "@/features/model-kits/utils/modelKitMatching";
import { findCompatibleParts, splitByKitMembership } from "../utils/compatibleParts";

export interface IUseCompatibleParts {
  isLoading: boolean;
  model: IVehicleModel | null;
  /** Catalog parts whose applications match the vehicle's model (Catálogo mode). */
  parts: IPart[];
  /** The applicable kit's items resolved to parts — shown regardless of the
   *  application match so the curated set is always visible (No Kit oficial / Só o Kit). */
  kitParts: IPart[];
  /** Compatible parts that are NOT in the kit (curation opportunities). */
  drift: IPart[];
  applicableKit: IVehicleModelKit | null;
}

/** Resolves compatible parts + applicable filter kit + drift split for a vehicle. */
export function useCompatibleParts(vehicle: IVehicle): IUseCompatibleParts {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts", "compatible-slice"],
    queryFn: async () =>
      (await partsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true })).data,
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

  const partsById = useMemo(() => new Map(allParts.map((p) => [p.id, p] as const)), [allParts]);

  // Kit's own parts, resolved from the full catalog — always shown when a kit
  // applies, even if a part's applications don't match this exact model.
  const kitParts = useMemo(() => {
    if (!applicableKit) return [];
    return applicableKit.items
      .map((item) => partsById.get(item.partId))
      .filter((p): p is IPart => Boolean(p));
  }, [applicableKit, partsById]);

  // Drift = compatible parts that are not curated into the kit.
  const drift = useMemo(
    () => splitByKitMembership(parts, applicableKit).drift,
    [parts, applicableKit],
  );

  return {
    isLoading: partsQuery.isLoading || vehicleModelsQuery.isLoading || modelKitsQuery.isLoading,
    model,
    parts,
    kitParts,
    drift,
    applicableKit,
  };
}
