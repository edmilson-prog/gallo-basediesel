import type { IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { normalizeToken } from "./modelKitMatching";

/** True when one of a part's applications matches the model by brand + model. */
function partAppliesToModel(part: IPart, model: IVehicleModel): boolean {
  return part.applications.some(
    (app) =>
      normalizeToken(app.vehicleBrand) === normalizeToken(model.brand) &&
      normalizeToken(app.vehicleModel) === normalizeToken(model.model),
  );
}

/** Every catalog part whose applications reach this model — the pool a kit is
 *  curated from, and the number the empty state quotes. */
export function getCompatiblePartsForModel(
  model: IVehicleModel | undefined,
  parts: IPart[],
): IPart[] {
  if (!model) return [];
  return parts.filter((part) => partAppliesToModel(part, model));
}

/**
 * Catalog drift: parts compatible with the kit's model that are NOT yet in the
 * kit. Powers the "N peças compatíveis fora do kit" banner.
 */
export function getCompatiblePartsNotInKit(
  kit: IVehicleModelKit,
  model: IVehicleModel | undefined,
  parts: IPart[],
): IPart[] {
  if (!model) return [];
  const inKit = new Set(kit.items.map((i) => i.partId));
  return parts.filter((p) => !inKit.has(p.id) && partAppliesToModel(p, model));
}

/**
 * Same drift, widened to the whole ficha: compatible parts that no kit of the
 * model carries. A part already curated into one kit is not "missing" just
 * because another kit skips it.
 */
export function getPartsOutsideKits(
  kits: IVehicleModelKit[],
  model: IVehicleModel | undefined,
  parts: IPart[],
): IPart[] {
  if (!model) return [];
  const inAnyKit = new Set<string>();
  for (const kit of kits) {
    for (const item of kit.items) inAnyKit.add(item.partId);
  }
  return parts.filter((p) => !inAnyKit.has(p.id) && partAppliesToModel(p, model));
}
