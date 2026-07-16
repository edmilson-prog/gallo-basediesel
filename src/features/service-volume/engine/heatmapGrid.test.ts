import { describe, it, expect } from "vitest";
import { buildHeatmapGrid } from "./heatmapGrid";

describe("buildHeatmapGrid", () => {
  it("returns an all-zero 7x24 grid for undefined / empty results", () => {
    for (const input of [undefined, { rows: [], totalMessages: 0 }]) {
      const grid = buildHeatmapGrid(input);
      expect(grid.totalMessages).toBe(0);
      expect(grid.maxCellValue).toBe(0);
      expect(grid.cells).toHaveLength(7);
      expect(grid.cells.every((row) => row.length === 24 && row.every((v) => v === 0))).toBe(true);
    }
  });

  it("places sparse rows at [day][hour] and tracks the max", () => {
    const grid = buildHeatmapGrid({
      rows: [
        { day: 1, hour: 9, count: 4 },
        { day: 5, hour: 17, count: 11 },
      ],
      totalMessages: 15,
    });
    expect(grid.cells[1]![9]).toBe(4);
    expect(grid.cells[5]![17]).toBe(11);
    expect(grid.totalMessages).toBe(15);
    expect(grid.maxCellValue).toBe(11);
  });

  it("ignores out-of-range cells defensively", () => {
    const grid = buildHeatmapGrid({
      rows: [
        { day: 7, hour: 0, count: 3 },
        { day: 0, hour: 24, count: 3 },
        { day: 2, hour: 2, count: 1 },
      ],
      totalMessages: 7,
    });
    expect(grid.cells[2]![2]).toBe(1);
    expect(grid.maxCellValue).toBe(1);
  });

  it("returned empty grid is a fresh copy (no shared mutable state)", () => {
    const a = buildHeatmapGrid(undefined);
    a.cells[0]![0] = 99;
    const b = buildHeatmapGrid(undefined);
    expect(b.cells[0]![0]).toBe(0);
  });
});
