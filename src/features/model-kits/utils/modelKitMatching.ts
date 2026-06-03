import type { ID, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";

/** Normalize a brand/model token for tolerant string comparison. */
export function normalizeToken(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a vehicle and a canonical model share brand + model (engine is a
 *  bonus, not required — vehicles may carry coarser engine strings). */
export function vehicleMatchesModel(vehicle: IVehicle, model: IVehicleModel): boolean {
  return (
    normalizeToken(vehicle.brand) === normalizeToken(model.brand) &&
    normalizeToken(vehicle.model) === normalizeToken(model.model)
  );
}

/**
 * Kits applicable to a vehicle, official before draft. STRING matching until
 * PRD-016 adds `IVehicle.modelId` — this is the single function PRD-016 rewrites.
 */
export function findKitsForVehicle(
  vehicle: IVehicle,
  kits: IVehicleModelKit[],
  modelsById: Map<ID, IVehicleModel>,
): IVehicleModelKit[] {
  const matched = kits.filter((kit) => {
    const model = modelsById.get(kit.modelId);
    return model ? vehicleMatchesModel(vehicle, model) : false;
  });
  return matched.sort((a, b) => {
    if (a.status !== b.status) return a.status === "oficial" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}
