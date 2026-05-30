import type { IVehicle } from "@/shared/types";

export interface IKmPoint {
  /** Short label, e.g. "mar/25" or "atual". */
  label: string;
  km: number;
  /** Sort key (ms). */
  ts: number;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function shortLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Ascending km-over-time series from service entries that carry a km reading,
 * plus a trailing "atual" point when currentKm is known and not lower than the
 * last reading. Returns [] when fewer than 2 usable points exist.
 */
export function buildKmSeries(vehicle: IVehicle, now: Date = new Date()): IKmPoint[] {
  const points: IKmPoint[] = [];
  for (const entry of vehicle.serviceHistory) {
    if (typeof entry.km !== "number") continue;
    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime())) continue;
    points.push({ label: shortLabel(d), km: entry.km, ts: d.getTime() });
  }
  points.sort((a, b) => a.ts - b.ts);
  if (typeof vehicle.currentKm === "number") {
    const last = points[points.length - 1];
    if (!last || vehicle.currentKm >= last.km) {
      points.push({ label: "atual", km: vehicle.currentKm, ts: now.getTime() });
    }
  }
  return points.length >= 2 ? points : [];
}

/** Estimated usage in km/year, or null when not derivable. */
export function usagePerYear(vehicle: IVehicle, now: Date = new Date()): number | null {
  const current = vehicle.currentKm;
  if (typeof current !== "number") return null;

  const withKm = vehicle.serviceHistory
    .filter((e) => typeof e.km === "number" && !Number.isNaN(new Date(e.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const first = withKm[0];
  if (first) {
    const years = (now.getTime() - new Date(first.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    const deltaKm = current - (first.km as number);
    if (years >= 0.1 && deltaKm > 0) return Math.round(deltaKm / years);
  }
  // Fallback: total km spread over the vehicle's age.
  const age = Math.max(1, now.getFullYear() - vehicle.year);
  return Math.round(current / age);
}
