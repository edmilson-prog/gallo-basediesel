import { describe, expect, it } from "vitest";
import { marginHealth, marginOnPrice } from "./pricing";

describe("marginOnPrice", () => {
  it("computes the margin share on the sale price", () => {
    // kit example: price 166.50, avg cost 92.50 → 44.4%
    expect(marginOnPrice(166.5, 92.5)).toBeCloseTo(0.4444, 3);
  });

  it("returns 0 when the price is zero or negative", () => {
    expect(marginOnPrice(0, 92.5)).toBe(0);
    expect(marginOnPrice(-10, 92.5)).toBe(0);
  });

  it("goes negative when the cost exceeds the price", () => {
    expect(marginOnPrice(100, 150)).toBeCloseTo(-0.5, 5);
  });
});

describe("marginHealth", () => {
  it("rates ≥45% as success", () => {
    expect(marginHealth(0.45)).toBe("success");
    expect(marginHealth(0.6)).toBe("success");
  });

  it("rates ≥30% and <45% as warning", () => {
    expect(marginHealth(0.3)).toBe("warning");
    expect(marginHealth(0.4499)).toBe("warning");
  });

  it("rates <30% as critical", () => {
    expect(marginHealth(0.2999)).toBe("critical");
    expect(marginHealth(0)).toBe("critical");
    expect(marginHealth(-0.2)).toBe("critical");
  });
});
