import { useMemo } from "react";
import type { IManagerDashboardSnapshot } from "@/providers/data";

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

export function useVolumeHeatmap(snapshot: IManagerDashboardSnapshot): IVolumeHeatmapData {
  return useMemo(() => {
    const cells: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    let totalMessages = 0;
    let maxCellValue = 0;
    for (const msg of snapshot.messagesInPeriod) {
      if (msg.direction !== "in" || msg.authorType !== "customer") continue;
      const date = new Date(msg.sentAt);
      const d = date.getDay();
      const h = date.getHours();
      if (Number.isNaN(d) || Number.isNaN(h)) continue;
      cells[d][h] += 1;
      totalMessages += 1;
      if (cells[d][h] > maxCellValue) maxCellValue = cells[d][h];
    }
    if (totalMessages === 0) {
      return { cells: EMPTY_GRID.map((row) => [...row]), totalMessages: 0, maxCellValue: 0 };
    }
    return { cells, totalMessages, maxCellValue };
  }, [snapshot]);
}
