import type { IVehicle } from "@/shared/types";

/**
 * Simple km-based maintenance heuristic (PRD-016 fase 4).
 * Each rule defines an interval (km) and a regex that matches the part name
 * snapshot stored in `IVehicleServiceEntry.parts`. Future revisions can
 * source these intervals from settings (PRD-019).
 */
export interface IMaintenanceRule {
  key: "filters" | "belt" | "brakes" | "overhaul";
  label: string;
  intervalKm: number;
  match: RegExp;
  /** km window for "do this soon" alerts. */
  warnWindowKm: number;
}

export const MAINTENANCE_RULES: IMaintenanceRule[] = [
  {
    key: "filters",
    label: "Filtros (óleo, ar, combustível)",
    intervalKm: 30_000,
    match: /filtro/i,
    warnWindowKm: 5_000,
  },
  {
    key: "belt",
    label: "Correia dentada",
    intervalKm: 100_000,
    match: /correia/i,
    warnWindowKm: 5_000,
  },
  {
    key: "brakes",
    label: "Freios",
    intervalKm: 80_000,
    match: /(freio|pastilha|disco)/i,
    warnWindowKm: 5_000,
  },
  {
    key: "overhaul",
    label: "Revisão completa",
    intervalKm: 250_000,
    match: /(revis[ãa]o|overhaul)/i,
    warnWindowKm: 10_000,
  },
];

export interface IMaintenanceRecommendation {
  rule: IMaintenanceRule;
  /** km remaining until the next due maintenance (negative ⇒ overdue). */
  remainingKm: number;
  /** km when the next maintenance is due. */
  nextDueKm: number;
  /** km of the last detected service for this rule, or null if none. */
  lastServiceKm: number | null;
}

export function computeRecommendations(vehicle: IVehicle): IMaintenanceRecommendation[] {
  const currentKm = vehicle.currentKm ?? 0;
  return MAINTENANCE_RULES.map((rule) => {
    const matching = vehicle.serviceHistory
      .filter((entry) => entry.parts.some((p) => rule.match.test(p)) && entry.km !== undefined)
      .sort((a, b) => (b.km ?? 0) - (a.km ?? 0));
    const lastServiceKm = matching[0]?.km ?? null;
    const baseKm = lastServiceKm ?? 0;
    const nextDueKm = baseKm + rule.intervalKm;
    const remainingKm = nextDueKm - currentKm;
    return { rule, remainingKm, nextDueKm, lastServiceKm };
  }).filter((rec) => rec.remainingKm <= rec.rule.warnWindowKm);
}
