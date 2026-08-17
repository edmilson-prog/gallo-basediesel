import type { IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { applicationMatchesModel } from "../engine";

/**
 * True when one of a part's applications reaches the model. Delegates to the
 * engine, which knows the supplier dialect (`fh13460` is an `FH 460`); a plain
 * string comparison matched nothing in production.
 */
function partAppliesToModel(part: IPart, model: IVehicleModel): boolean {
  return (part.applications ?? []).some((app) => applicationMatchesModel(app, model));
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
