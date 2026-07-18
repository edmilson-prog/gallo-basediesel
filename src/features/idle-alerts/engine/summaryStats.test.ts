import { describe, expect, it } from "vitest";
import { totalPending, worstLevel } from "./summaryStats";
import type { IIdleSummary } from "@/shared/types";

function counts(level1: number, level2: number, level3: number): IIdleSummary["counts"] {
  return { level1, level2, level3 };
}

describe("totalPending", () => {
  it("sums all levels", () => {
    expect(totalPending(counts(2, 3, 4))).toBe(9);
  });

  it("returns 0 when all levels are zero", () => {
    expect(totalPending(counts(0, 0, 0))).toBe(0);
  });
});

describe("worstLevel", () => {
  it("returns 1 when all counts are zero", () => {
    expect(worstLevel(counts(0, 0, 0))).toBe(1);
  });

  it("returns 1 when only level1 entries exist", () => {
    expect(worstLevel(counts(5, 0, 0))).toBe(1);
  });

  it("returns 2 when level2 is present", () => {
    expect(worstLevel(counts(1, 1, 0))).toBe(2);
  });

  it("returns 3 when level3 is present, even alongside other levels", () => {
    expect(worstLevel(counts(1, 1, 1))).toBe(3);
  });
});
