import type { IVehicle } from "@/shared/types";

/**
 * Cadastro completeness ("ficha") of a vehicle.
 *
 * The vast majority of the imported DINTEC fleet arrives with only brand,
 * model, year, plate and owner — km, engine, VIN and the canonical model are
 * blank. Instead of rendering four columns of `—`, the list and the detail
 * header state what is *missing*, turning the list into an enrichment queue.
 *
 * This is a derived concept: nothing in `IVehicle` stores it.
 */
export type VehicleFichaField = "km" | "motor" | "chassi" | "modelo";

export interface IVehicleFichaGap {
  key: VehicleFichaField;
  /** Lowercase noun, rendered as "sem {label}". */
  label: string;
}

export interface IVehicleFicha {
  missing: IVehicleFichaGap[];
  /** Fields already filled in. */
  done: number;
  /** Fields tracked (always {@link FICHA_TOTAL}). */
  total: number;
  isComplete: boolean;
}

export const FICHA_TOTAL = 4;

export function vehicleFicha(vehicle: IVehicle): IVehicleFicha {
  const missing: IVehicleFichaGap[] = [];
  if (typeof vehicle.currentKm !== "number") missing.push({ key: "km", label: "km" });
  if (!vehicle.engine) missing.push({ key: "motor", label: "motor" });
  if (!vehicle.vin) missing.push({ key: "chassi", label: "chassi" });
  if (vehicle.modelId == null) missing.push({ key: "modelo", label: "modelo" });
  return {
    missing,
    done: FICHA_TOTAL - missing.length,
    total: FICHA_TOTAL,
    isComplete: missing.length === 0,
  };
}
