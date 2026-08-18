import { describe, expect, it } from "vitest";
import { weightedAverageCost } from "./averageCost";

describe("weightedAverageCost", () => {
  it("weights the incoming cost against the existing balance (RC-04)", () => {
    // 14 UN a 58.90 + 24 UN a 65.00 → (824.60 + 1560.00) / 38
    expect(
      weightedAverageCost({
        currentStock: 14,
        currentAverage: 58.9,
        incomingQuantity: 24,
        incomingUnitCost: 65,
      }),
    ).toBeCloseTo(2384.6 / 38, 6);
  });

  it("returns the incoming cost when there is no balance", () => {
    expect(
      weightedAverageCost({
        currentStock: 0,
        currentAverage: 58.9,
        incomingQuantity: 10,
        incomingUnitCost: 71.2,
      }),
    ).toBe(71.2);
  });

  it("returns the incoming cost when the balance is negative", () => {
    expect(
      weightedAverageCost({
        currentStock: -5,
        currentAverage: 40,
        incomingQuantity: 10,
        incomingUnitCost: 71.2,
      }),
    ).toBe(71.2);
  });

  it("returns the incoming cost when the current average is unknown", () => {
    expect(
      weightedAverageCost({
        currentStock: 20,
        currentAverage: 0,
        incomingQuantity: 10,
        incomingUnitCost: 71.2,
      }),
    ).toBe(71.2);
  });

  it("keeps the current average when nothing comes in", () => {
    expect(
      weightedAverageCost({
        currentStock: 20,
        currentAverage: 58.9,
        incomingQuantity: 0,
        incomingUnitCost: 71.2,
      }),
    ).toBe(58.9);
  });

  it("is stable when the incoming cost equals the current average", () => {
    expect(
      weightedAverageCost({
        currentStock: 31,
        currentAverage: 46.1,
        incomingQuantity: 60,
        incomingUnitCost: 46.1,
      }),
    ).toBeCloseTo(46.1, 6);
  });
});
