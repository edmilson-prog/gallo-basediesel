import type { IVehicle } from "@/shared/types";
import { computeRecommendations } from "./maintenanceRules";

export type VehicleHealthStatus = "ok" | "attention" | "overdue";

export interface IVehicleHealth {
  /** 0..100 — higher is healthier. */
  score: number;
  status: VehicleHealthStatus;
  overdueCount: number;
  upcomingCount: number;
}

const OVERDUE_PENALTY = 20;
const UPCOMING_PENALTY = 8;

/**
 * Consolidates the km-based maintenance rules into a single health snapshot.
 * Built on `computeRecommendations`, which already returns only the rules that
 * are overdue (remainingKm <= 0) or due soon (0 < remainingKm <= warnWindow).
 */
export function computeHealth(vehicle: IVehicle): IVehicleHealth {
  const recs = computeRecommendations(vehicle);
  const overdueCount = recs.filter((r) => r.remainingKm <= 0).length;
  const upcomingCount = recs.filter((r) => r.remainingKm > 0).length;
  const raw = 100 - OVERDUE_PENALTY * overdueCount - UPCOMING_PENALTY * upcomingCount;
  const score = Math.max(0, Math.min(100, raw));
  const status: VehicleHealthStatus =
    overdueCount > 0 ? "overdue" : upcomingCount > 0 ? "attention" : "ok";
  return { score, status, overdueCount, upcomingCount };
}
