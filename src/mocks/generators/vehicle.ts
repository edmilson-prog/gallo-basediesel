import type { ICustomer, ID, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { SEED_VEHICLE_MODELS, SEED_EXOTIC_VEHICLE_MODELS } from "../data";
import { SEED_VEHICLE_MODELS_CANONICAL, slug } from "../data/seedVehicleModelsCanonical";
import { daysAgo, randomISO, type ISeededContext } from "./utils";

const CANONICAL_MODEL_IDS = new Set(SEED_VEHICLE_MODELS_CANONICAL.map((m) => m.id));

/** Generate a vehicle owned by a customer (preferentially B2B fleets). */
export function generateVehicle(
  ctx: ISeededContext,
  options: { sequence: number; owner: ICustomer; now?: Date },
): IVehicle {
  // ~12% of vehicles draw from the exotic (non-canonical) pool → orphans.
  const useExotic = ctx.bool(0.12);
  const model = useExotic ? ctx.pick(SEED_EXOTIC_VEHICLE_MODELS) : ctx.pick(SEED_VEHICLE_MODELS);
  const engine = ctx.pick(model.engines);
  const year = ctx.int(model.yearStart, model.yearEnd);
  const id: ID = `vehicle-${String(options.sequence + 1).padStart(4, "0")}`;
  const now = options.now ?? new Date();

  const candidateModelId = `vmodel-${slug(model.brand)}-${slug(model.model)}-${slug(engine)}`;
  const modelId: ID | null = CANONICAL_MODEL_IDS.has(candidateModelId) ? candidateModelId : null;

  return {
    id,
    customerId: options.owner.id,
    brand: model.brand,
    model: model.model,
    year,
    engine,
    modelId,
    plate: ctx.bool(0.9) ? generatePlate(ctx) : undefined,
    vin: ctx.bool(0.6) ? generateVin(ctx) : undefined,
    currentKm: ctx.int(35_000, 850_000),
    serviceHistory: [],
    cadastroStatus: ctx.bool(0.85) ? "aprovado" : ctx.bool(0.5) ? "pendente" : "rejeitado",
    createdAt: randomISO(ctx, new Date(now.getFullYear() - 2, 0, 1), now),
  };
}

/** Service history entries — independent from the linked order id (resolved later). */
export function generateVehicleServiceEntry(
  ctx: ISeededContext,
  options: { sequence: number; vehicle: IVehicle; partNames: string[]; orderId?: ID },
): IVehicleServiceEntry {
  const parts = pickNonRepeating(ctx, options.partNames, ctx.int(1, 3));
  return {
    id: `vse-${String(options.sequence + 1).padStart(4, "0")}`,
    vehicleId: options.vehicle.id,
    orderId: options.orderId,
    parts,
    date: randomISO(ctx, daysAgo(540), new Date()),
    km: options.vehicle.currentKm ? ctx.int(20_000, options.vehicle.currentKm) : undefined,
  };
}

function generatePlate(ctx: ISeededContext): string {
  const letters = Array.from({ length: 3 }, () => alpha(ctx)).join("");
  const middle = String(ctx.int(0, 9));
  const letter = alpha(ctx);
  const tail = String(ctx.int(10, 99));
  return `${letters}${middle}${letter}${tail}`;
}

function generateVin(ctx: ISeededContext): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 17; i += 1) out += chars[ctx.int(0, chars.length - 1)];
  return out;
}

function alpha(ctx: ISeededContext): string {
  const code = ctx.int(65, 90);
  return String.fromCharCode(code);
}

function pickNonRepeating<T>(ctx: ISeededContext, items: readonly T[], count: number): T[] {
  if (items.length === 0) return [];
  const max = Math.min(count, items.length);
  const chosen = new Set<T>();
  while (chosen.size < max) chosen.add(ctx.pick(items));
  return Array.from(chosen);
}
