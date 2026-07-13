import { describe, expect, it } from "vitest";
import { buildDintecPriceTables } from "./dintecPriceTables";

describe("buildDintecPriceTables", () => {
  it("builds the 4 named tables from real DINTEC values (CODPRO 8366)", () => {
    const tables = buildDintecPriceTables({
      custo: 92.5,
      perc3: 100,
      valor3: 185.0,
      perc4: 60,
      valor4: 148.0,
      perc5: 80,
      valor5: 166.5,
      perc2: 140,
    });
    expect(tables).toEqual([
      { id: "oficina", label: "Oficina", markupPercent: 1.0, price: 185.0 },
      { id: "atacado", label: "Atacado", markupPercent: 0.6, price: 148.0 },
      { id: "varejo", label: "Varejo", markupPercent: 0.8, price: 166.5 },
      { id: "ecommerce", label: "Ecommerce", markupPercent: 1.4, price: 222.0 },
    ]);
  });

  it("omits tables whose VALOR is null/zero", () => {
    const tables = buildDintecPriceTables({
      custo: 24.73,
      perc3: null,
      valor3: null,
      perc4: null,
      valor4: null,
      perc5: 80,
      valor5: 44.51,
      perc2: 140,
    });
    expect(tables).toEqual([
      { id: "varejo", label: "Varejo", markupPercent: 0.8, price: 44.51 },
      { id: "ecommerce", label: "Ecommerce", markupPercent: 1.4, price: Number((24.73 * 2.4).toFixed(2)) },
    ]);
  });

  it("returns an empty array when custo is null", () => {
    expect(
      buildDintecPriceTables({ custo: null, perc3: 100, valor3: 185, perc4: null, valor4: null, perc5: null, valor5: null, perc2: 140 }),
    ).toEqual([]);
  });
});
