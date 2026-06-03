import type { ID, ISO8601 } from "./common";

/** Lifecycle status of a canonical vehicle model. */
export type VehicleModelStatus = "ativo" | "inativo";

/**
 * Canonical "market model" of a heavy vehicle (brand + model + engine + year
 * range). Reference data — the stable key (`id`) that future kits (PRD-035) and
 * the customer fleet (delta PRD-016) hang off. Distinct engines are distinct
 * canonical entries (DC13 ≠ DC13 EURO 5).
 */
export interface IVehicleModel {
  id: ID;
  brand: string;
  model: string;
  engine: string;
  yearStart?: number;
  yearEnd?: number;
  status: VehicleModelStatus;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
