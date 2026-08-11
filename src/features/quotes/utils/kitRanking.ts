// src/features/quotes/utils/kitRanking.ts
import type { IVehicle, IVehicleModelKit } from "@/shared/types";

export interface IRankedKit {
  kit: IVehicleModelKit;
  /**
   * Index into the customer's fleet of the vehicle this kit belongs to, or -1
   * when no vehicle matches. Drives the "no veículo" badge and the ordering.
   */
  matchedVehicleIndex: number;
}

/**
 * Order the store's kits for the quote editor: the ones that fit a vehicle the
 * customer actually owns come first (in fleet order), then official before
 * draft, then by name.
 *
 * Matching is by canonical `modelId` (PRD-034/016) — a vehicle with no
 * catalogued model matches nothing, which is why a store full of kits can still
 * show zero suggestions.
 */
export function rankKitsByFleet(kits: IVehicleModelKit[], vehicles: IVehicle[]): IRankedKit[] {
  const modelIndex = new Map<string, number>();
  vehicles.forEach((vehicle, index) => {
    if (vehicle.modelId != null && !modelIndex.has(vehicle.modelId)) {
      modelIndex.set(vehicle.modelId, index);
    }
  });

  return kits
    .map((kit) => ({ kit, matchedVehicleIndex: modelIndex.get(kit.modelId) ?? -1 }))
    .sort((a, b) => {
      const aMatched = a.matchedVehicleIndex >= 0;
      const bMatched = b.matchedVehicleIndex >= 0;
      if (aMatched !== bMatched) return aMatched ? -1 : 1;
      if (aMatched && bMatched) return a.matchedVehicleIndex - b.matchedVehicleIndex;
      if (a.kit.status !== b.kit.status) return a.kit.status === "oficial" ? -1 : 1;
      return a.kit.name.localeCompare(b.kit.name, "pt-BR");
    });
}

/**
 * The kit to offer unprompted: the top-ranked official kit that matches a
 * vehicle in the fleet. Drafts are never suggested on their own.
 */
export function pickSuggestedKit(ranked: IRankedKit[]): IRankedKit | null {
  return ranked.find((r) => r.matchedVehicleIndex >= 0 && r.kit.status === "oficial") ?? null;
}
