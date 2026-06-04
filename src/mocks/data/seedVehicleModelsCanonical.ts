// src/mocks/data/seedVehicleModelsCanonical.ts
import type { IVehicleModel } from "@/shared/types";
import { SEED_VEHICLE_MODELS } from "./seedVehicleModels";

/**
 * Canonical vehicle-model catalog (PRD-034), derived by expanding each engine
 * variant of SEED_VEHICLE_MODELS into a distinct IVehicleModel. Distinct engines
 * = distinct canonical entries (e.g. Scania R 450 / "DC13" and "DC13 EURO 5").
 *
 * Part applications are generated from the SAME source (SEED_VEHICLE_MODELS), so
 * folding them in would add no new brand+model+engine combos — intentionally
 * omitted to keep the catalog the single source it already is.
 */
const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const SEED_ACTOR = "system";

/** Slugify a brand/model/engine token for the canonical model id. Shared with
 *  the vehicle generator so both produce identical ids. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildCanonicalVehicleModels(): IVehicleModel[] {
  const out: IVehicleModel[] = [];
  const seen = new Set<string>();
  for (const entry of SEED_VEHICLE_MODELS) {
    for (const engine of entry.engines) {
      const key = `${entry.brand}|${entry.model}|${engine}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `vmodel-${slug(entry.brand)}-${slug(entry.model)}-${slug(engine)}`,
        brand: entry.brand,
        model: entry.model,
        engine,
        yearStart: entry.yearStart,
        yearEnd: entry.yearEnd,
        status: "ativo",
        createdBy: SEED_ACTOR,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      });
    }
  }
  return out;
}

/** Eagerly-built canonical seed (stable across the session). */
export const SEED_VEHICLE_MODELS_CANONICAL: IVehicleModel[] = buildCanonicalVehicleModels();
