import type { IHeatmapResult } from "@/shared/types";

/**
 * Aggregated counts per (dayOfWeek, hour) for inbound customer messages.
 * `cells[d][h]` returns the message count where d is 0..6 (Sun..Sat) and h
 * is 0..23.
 */
export interface IVolumeHeatmapData {
  cells: number[][];
  totalMessages: number;
  maxCellValue: number;
}

const EMPTY_GRID = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

/** Expand the RPC's sparse (day, hour, count) rows into the 7×24 grid. */
export function buildHeatmapGrid(result: IHeatmapResult | undefined): IVolumeHeatmapData {
  if (!result || result.totalMessages === 0) {
    return { cells: EMPTY_GRID.map((row) => [...row]), totalMessages: 0, maxCellValue: 0 };
  }
  const cells: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let maxCellValue = 0;
  for (const { day, hour, count } of result.rows) {
    const row = cells[day];
    if (!row || hour < 0 || hour > 23) continue;
    row[hour] = count;
    if (count > maxCellValue) maxCellValue = count;
  }
  return { cells, totalMessages: result.totalMessages, maxCellValue };
}
