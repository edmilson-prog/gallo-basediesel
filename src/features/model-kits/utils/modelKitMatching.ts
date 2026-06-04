import type { IVehicle, IVehicleModelKit } from "@/shared/types";

/** Normalize a brand/model token for tolerant string comparison. */
export function normalizeToken(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kits applicable to a vehicle, official before draft. Matches by the canonical
 * `modelId` (PRD-016). A vehicle without a catalogued model has no kits.
 */
export function findKitsForVehicle(
  vehicle: IVehicle,
  kits: IVehicleModelKit[],
): IVehicleModelKit[] {
  if (vehicle.modelId == null) return [];
  return kits
    .filter((kit) => kit.modelId === vehicle.modelId)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "oficial" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}
