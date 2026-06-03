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
