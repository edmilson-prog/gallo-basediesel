import type { IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { computeRecommendations } from "./maintenanceRules";

/** The most recent service entry by date, or null when there's no history. */
export function lastServiceEntry(vehicle: IVehicle): IVehicleServiceEntry | null {
  let latest: IVehicleServiceEntry | null = null;
  for (const entry of vehicle.serviceHistory) {
    if (!latest || entry.date.localeCompare(latest.date) > 0) latest = entry;
  }
  return latest;
}

export interface INextMaintenance {
  remainingKm: number;
  label: string;
}

/**
 * The soonest upcoming (not-yet-overdue) maintenance. Returns null when nothing
 * is upcoming — callers show an "em dia" / "—" treatment in that case.
 */
export function nextMaintenance(vehicle: IVehicle): INextMaintenance | null {
  const upcoming = computeRecommendations(vehicle)
    .filter((r) => r.remainingKm > 0)
    .sort((a, b) => a.remainingKm - b.remainingKm);
  const top = upcoming[0];
  return top ? { remainingKm: top.remainingKm, label: top.rule.label } : null;
}
