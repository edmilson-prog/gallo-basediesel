import { describe, expect, it } from "vitest";
import type { IPart, IPartSupplier } from "@/shared/types";
import { buildRestockSummary, latestSupplier, suggestedRestockQuantity } from "./restock";

function makeSupplier(overrides: Partial<IPartSupplier> = {}): IPartSupplier {
  return {
    id: "sup-1",
    name: "SCHERER S/A",
    cost: 92.5,
    quantity: 10,
    ...overrides,
  };
}

function makePart(overrides: Partial<IPart> = {}): IPart {
  return {
    id: "part-1",
    sku: "6256",
    name: "C20500 — FILTRO AR EXTERNO AGRALE MA 8.7",
    oemCodes: [],
    equivalentPartIds: [],
    applications: [],
    brand: "MANN FILTER",
    supplier: "SCHERER S/A",
    unitCost: 92.5,
    unitPrice: 166.5,
    marginPercent: 0.8,
    stockAvailable: 0,
    stockMinimum: 10,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("latestSupplier", () => {
  it("returns null without suppliers", () => {
    expect(latestSupplier(undefined)).toBeNull();
    expect(latestSupplier([])).toBeNull();
  });

  it("picks the entry with the most recent invoice date", () => {
    const old = makeSupplier({ id: "a", name: "GLOBAL DIESEL", invoiceDate: "2023-02-03" });
    const recent = makeSupplier({ id: "b", name: "SCHERER S/A", invoiceDate: "2026-06-22" });
    expect(latestSupplier([old, recent])?.id).toBe("b");
  });

  it("sorts entries without a date last", () => {
    const dated = makeSupplier({ id: "a", invoiceDate: "2023-02-03" });
    const undated = makeSupplier({ id: "b", invoiceDate: undefined });
    expect(latestSupplier([undated, dated])?.id).toBe("a");
  });
});

describe("suggestedRestockQuantity", () => {
  it("restocks to twice the minimum", () => {
    expect(suggestedRestockQuantity(0, 10)).toBe(20);
    expect(suggestedRestockQuantity(5, 10)).toBe(15);
  });

  it("never suggests less than 1 unit", () => {
    expect(suggestedRestockQuantity(30, 10)).toBe(1);
  });
});

describe("buildRestockSummary", () => {
  it("includes identity, stock numbers and the latest supplier", () => {
    const part = makePart({
      reference: "C20500",
      suppliers: [
        makeSupplier({ name: "SCHERER S/A", invoiceNumber: "229480", invoiceDate: "2026-06-22" }),
      ],
    });
    const summary = buildRestockSummary(part);
    expect(summary).toContain("C20500 — FILTRO AR EXTERNO AGRALE MA 8.7");
    expect(summary).toContain("SKU 6256 · Ref. C20500");
    expect(summary).toContain("Estoque atual: 0 · Mínimo: 10");
    expect(summary).toContain("Quantidade sugerida: 20 un");
    expect(summary).toContain("SCHERER S/A · NF 229480");
    expect(summary).toContain("92,50");
  });

  it("omits the supplier line when there is no history", () => {
    const summary = buildRestockSummary(makePart());
    expect(summary).not.toContain("Último fornecedor");
  });
});
