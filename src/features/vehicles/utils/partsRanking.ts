import type { IVehicle } from "@/shared/types";

export interface IPartRank {
  name: string;
  count: number;
}

/** Aggregate part-name frequency across the service history, descending. */
export function rankParts(vehicle: IVehicle, topN = 6): IPartRank[] {
  const counts = new Map<string, number>();
  for (const entry of vehicle.serviceHistory) {
    for (const raw of entry.parts) {
      const name = raw.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, topN);
}
