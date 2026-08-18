import { describe, expect, it } from "vitest";
import { convertToStock } from "./unitConversion";

describe("convertToStock", () => {
  it("passes quantity straight through in direct mode (RC-02)", () => {
    const r = convertToStock({
      quantity: 24,
      mode: "direto",
      factor: null,
      noteUnit: "UN",
      conversionUnit: undefined,
      partUnit: "UN",
      itemTotalValue: 2157.6,
      allocatedCharges: 0,
    });
    expect(r.factor).toBe(1);
    expect(r.stockQuantity).toBe(24);
    expect(r.stockUnit).toBe("UN");
    expect(r.unitCost).toBeCloseTo(89.9, 6);
  });

  it("multiplies by the factor when converting a box into units (RC-02)", () => {
    const r = convertToStock({
      quantity: 16,
      mode: "conv",
      factor: 12,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 9062.4,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(192);
    expect(r.stockUnit).toBe("UN");
    expect(r.unitCost).toBeCloseTo(47.2, 6);
  });

  it("folds the allocated charges into the unit cost (RC-02)", () => {
    const r = convertToStock({
      quantity: 2,
      mode: "conv",
      factor: 12,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 1396.8,
      allocatedCharges: 187.83,
    });
    expect(r.stockQuantity).toBe(24);
    expect(r.unitCost).toBeCloseTo((1396.8 + 187.83) / 24, 6);
  });

  it("uses the yield per package when fractioning (RC-03)", () => {
    const r = convertToStock({
      quantity: 8,
      mode: "frac",
      factor: 20,
      noteUnit: "BD",
      conversionUnit: "L",
      partUnit: "UN",
      itemTotalValue: 2064.0,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(160);
    expect(r.stockUnit).toBe("L");
    expect(r.unitCost).toBeCloseTo(12.9, 6);
  });

  it("returns null quantity and cost when the factor is undefined — this blocks posting", () => {
    const r = convertToStock({
      quantity: 13,
      mode: "conv",
      factor: null,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 2028.0,
      allocatedCharges: 0,
    });
    expect(r.factor).toBeNull();
    expect(r.stockQuantity).toBeNull();
    expect(r.unitCost).toBeNull();
  });

  it("treats a zero or negative factor as undefined", () => {
    for (const factor of [0, -3]) {
      const r = convertToStock({
        quantity: 5,
        mode: "conv",
        factor,
        noteUnit: "CX",
        conversionUnit: "UN",
        partUnit: "UN",
        itemTotalValue: 100,
        allocatedCharges: 0,
      });
      expect(r.stockQuantity).toBeNull();
    }
  });

  it("falls back to the note unit in direct mode when the item has no linked part", () => {
    const r = convertToStock({
      quantity: 3,
      mode: "direto",
      factor: null,
      noteUnit: "PCT",
      conversionUnit: undefined,
      partUnit: undefined,
      itemTotalValue: 30,
      allocatedCharges: 0,
    });
    expect(r.stockUnit).toBe("PCT");
  });

  it("rounds the converted quantity to two decimals", () => {
    const r = convertToStock({
      quantity: 1.25,
      mode: "conv",
      factor: 3,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 90,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(3.75);
  });

  // Comportamento deliberado, não bug a corrigir: 1.005 * 3 vale
  // 3.0149999999999997 em IEEE 754, não 3.015, então toFixed(2) desce para
  // 3.01. Corrigir isso exigiria fudge de epsilon, que arrisca arredondar
  // errado valores legítimos abaixo da metade — troca ruim, porque na prática
  // qCom vem do XML e o fator é inteiro, e o produto é inteiro.
  it("rounds a decimal-exact half down, because the binary product falls below it", () => {
    const r = convertToStock({
      quantity: 1.005,
      mode: "conv",
      factor: 3,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 90,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(3.01);
  });

  it("keeps the unit cost consistent with the quantity actually credited", () => {
    const r = convertToStock({
      quantity: 1.005,
      mode: "conv",
      factor: 3,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 90,
      allocatedCharges: 0,
    });
    // O custo divide pela quantidade arredondada, não pela exata — é essa a
    // quantidade que entra no estoque, e as duas têm de fechar.
    expect(r.unitCost).toBeCloseTo(90 / 3.01, 10);
  });
});
