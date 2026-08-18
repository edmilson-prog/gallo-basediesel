import { describe, expect, it } from "vitest";
import { marginHealth, marginOnPrice, updateTableMarkup, updateTablePrice } from "./pricing";

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

describe("updateTableMarkup", () => {
  it("recomputes the price from the new markup", () => {
    const table = { id: "padrao", label: "Padrão", markupPercent: 0.8, price: 166.5 };
    const updated = updateTableMarkup(table, 1.0, 92.5);
    expect(updated.markupPercent).toBe(1.0);
    expect(updated.price).toBeCloseTo(185, 2);
    expect(updated.id).toBe("padrao");
    expect(updated.label).toBe("Padrão");
  });
});

describe("updateTablePrice", () => {
  it("recomputes the markup from the new price", () => {
    const table = { id: "padrao", label: "Padrão", markupPercent: 0.8, price: 166.5 };
    const updated = updateTablePrice(table, 185, 92.5);
    expect(updated.price).toBe(185);
    expect(updated.markupPercent).toBeCloseTo(1.0, 3);
  });

  it("does not divide by zero when the base cost is zero", () => {
    const table = { id: "padrao", label: "Padrão", markupPercent: 0, price: 0 };
    const updated = updateTablePrice(table, 50, 0);
    expect(updated.price).toBe(50);
    expect(updated.markupPercent).toBe(0);
  });
});
