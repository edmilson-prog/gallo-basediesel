import type { IPart, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { searchPartsByApplication } from "@/features/catalog/api/search";

/**
 * Parts compatible with a vehicle, sourced from the catalog `applications[]`.
 * The canonical model (PRD-034) is authoritative; falls back to the vehicle's
 * denormalized snapshot for orphans (which match nothing — exotic models have
 * no catalog applications).
 *
 * Matching is brand + model + year (engine-agnostic on purpose): part
 * applications rarely carry the exact engine string of every model variant, so
 * requiring an engine match left the list near-empty. Engine precision is a
 * future refinement once `IApplication` carries `modelId` (delta do catálogo).
 */
export function findCompatibleParts(
  vehicle: IVehicle,
  model: IVehicleModel | null,
  parts: IPart[],
): IPart[] {
  const brand = model?.brand ?? vehicle.brand;
  const modelName = model?.model ?? vehicle.model;
  return searchPartsByApplication(parts, {
    brand,
    model: modelName,
    year: vehicle.year,
  });
}

/**
 * Split compatible parts into those already in the kit ("curated") and those
 * compatible but outside it ("drift" — curation opportunities). With no kit,
 * every compatible part is drift.
 */
export function splitByKitMembership(
  parts: IPart[],
  kit: IVehicleModelKit | null,
): { inKit: IPart[]; drift: IPart[] } {
  if (!kit) return { inKit: [], drift: parts };
  const kitPartIds = new Set(kit.items.map((i) => i.partId));
  return {
    inKit: parts.filter((p) => kitPartIds.has(p.id)),
    drift: parts.filter((p) => !kitPartIds.has(p.id)),
  };
}
