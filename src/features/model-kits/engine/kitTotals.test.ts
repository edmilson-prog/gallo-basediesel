import { describe, expect, it } from "vitest";
import { computeKitTotals, getStockState, type IKitTotalsLine } from "./kitTotals";

function line(
  overrides: Partial<IKitTotalsLine> & { unitPrice?: number; stockAvailable?: number } = {},
): IKitTotalsLine {
  const {
    unitPrice = 100,
    stockAvailable = 10,
    defaultQuantity = 1,
    isOptional = false,
  } = overrides;
  return {
    part: { unitPrice, stockAvailable, stockMinimum: 4 },
    defaultQuantity,
    isOptional,
  };
}

describe("getStockState", () => {
  it("flags a part with no stock", () => {
    const state = getStockState({ stockAvailable: 0, stockMinimum: 4 });
    expect(state.tone).toBe("out");
    expect(state.label).toBe("sem estoque");
  });

  it("flags stock at or below the minimum as low", () => {
    expect(getStockState({ stockAvailable: 4, stockMinimum: 4 }).tone).toBe("low");
    expect(getStockState({ stockAvailable: 4, stockMinimum: 4 }).label).toBe("4 (baixo)");
    expect(getStockState({ stockAvailable: 3, stockMinimum: 4 }).tone).toBe("low");
  });

  it("reports healthy stock", () => {
    const state = getStockState({ stockAvailable: 22, stockMinimum: 8 });
    expect(state.tone).toBe("ok");
    expect(state.label).toBe("22 em estoque");
  });

  it("treats a negative balance as no stock", () => {
    expect(getStockState({ stockAvailable: -2, stockMinimum: 4 }).tone).toBe("out");
  });
});

describe("computeKitTotals", () => {
  it("splits base and optional money", () => {
    const totals = computeKitTotals([
      line({ unitPrice: 100, defaultQuantity: 2 }),
      line({ unitPrice: 50 }),
      line({ unitPrice: 80, isOptional: true }),
    ]);
    expect(totals.base).toBe(250);
    expect(totals.optional).toBe(80);
    expect(totals.total).toBe(330);
    expect(totals.baseCount).toBe(2);
    expect(totals.optionalCount).toBe(1);
    expect(totals.count).toBe(3);
  });

  it("multiplies the unit price by the default quantity", () => {
    const totals = computeKitTotals([line({ unitPrice: 74.9, defaultQuantity: 2 })]);
    expect(totals.base).toBeCloseTo(149.8, 2);
  });

  it("counts the lines whose part has no stock", () => {
    const totals = computeKitTotals([
      line({ stockAvailable: 0 }),
      line({ stockAvailable: 0, isOptional: true }),
      line({ stockAvailable: 5 }),
    ]);
    expect(totals.outOfStockCount).toBe(2);
  });

  it("returns zeroes for an empty kit", () => {
    const totals = computeKitTotals([]);
    expect(totals).toMatchObject({
      base: 0,
      optional: 0,
      total: 0,
      count: 0,
      baseCount: 0,
      optionalCount: 0,
      outOfStockCount: 0,
    });
  });
});
