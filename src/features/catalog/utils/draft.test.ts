import { describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import { parseOemCodes, toPartDraft } from "./draft";

function makePart(overrides: Partial<IPart> = {}): IPart {
  return {
    id: "part-1",
    sku: "6256",
    name: "Filtro de óleo",
    oemCodes: ["VOL-123456", "ALT-1", "ALT-2"],
    equivalentPartIds: ["part-2"],
    applications: [],
    brand: "Volvo",
    supplier: "Scherer",
    unitCost: 92.5,
    unitPrice: 166.5,
    marginPercent: 0.8,
    stockAvailable: 12,
    stockMinimum: 5,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseOemCodes", () => {
  it("joins the primary code with trimmed alternatives", () => {
    expect(parseOemCodes("VOL-1", " ALT-1 , ALT-2,,ALT-3 ")).toEqual([
      "VOL-1",
      "ALT-1",
      "ALT-2",
      "ALT-3",
    ]);
  });

  it("drops empty entries", () => {
    expect(parseOemCodes("", "")).toEqual([]);
  });
});

describe("toPartDraft", () => {
  it("maps identification fields with the same fallbacks as the old PartForm", () => {
    const draft = toPartDraft(makePart());
    expect(draft.name).toBe("Filtro de óleo");
    expect(draft.oemPrimary).toBe("VOL-123456");
    expect(draft.oemAlternatives).toBe("ALT-1, ALT-2");
    expect(draft.brand).toBe("Volvo");
    expect(draft.supplier).toBe("Scherer");
    expect(draft.isOriginal).toBe(false);
    expect(draft.category).toBeUndefined();
    expect(draft.gtin).toBe("");
    expect(draft.reference).toBe("");
  });

  it("always materializes 5 price tables via resolvePriceTables", () => {
    const draft = toPartDraft(makePart());
    expect(draft.priceTables).toHaveLength(5);
    expect(draft.priceTables.find((t) => t.id === "padrao")?.price).toBeCloseTo(166.5, 2);
  });

  it("preserves explicit stored price tables instead of recomputing them", () => {
    const draft = toPartDraft(
      makePart({
        priceTables: [{ id: "padrao", label: "Padrão", markupPercent: 0.5, price: 138.75 }],
      }),
    );
    expect(draft.priceTables).toEqual([
      { id: "padrao", label: "Padrão", markupPercent: 0.5, price: 138.75 },
    ]);
  });

  it("defaults fiscal fields to empty/false when absent", () => {
    const draft = toPartDraft(makePart());
    expect(draft.fiscal).toEqual({
      ncm: "",
      icmsPercent: undefined,
      taxSubstitution: false,
      origin: "",
    });
  });

  it("maps existing fiscal data as-is", () => {
    const draft = toPartDraft(
      makePart({ fiscal: { ncm: "8421.23.00", icmsPercent: 17, taxSubstitution: true, origin: "Nacional" } }),
    );
    expect(draft.fiscal).toEqual({
      ncm: "8421.23.00",
      icmsPercent: 17,
      taxSubstitution: true,
      origin: "Nacional",
    });
  });

  it("maps logistics and stock fields", () => {
    const draft = toPartDraft(
      makePart({ weightKg: 1.2, storageLocation: "A-12", boxQuantity: 10, fractionable: true, unitOfMeasure: "PC" }),
    );
    expect(draft.weightKg).toBe(1.2);
    expect(draft.storageLocation).toBe("A-12");
    expect(draft.boxQuantity).toBe(10);
    expect(draft.fractionable).toBe(true);
    expect(draft.unitOfMeasure).toBe("PC");
    expect(draft.stockAvailable).toBe(12);
    expect(draft.stockMinimum).toBe(5);
  });

  it("carries over collections and starts the new-supplier-entry as null", () => {
    const draft = toPartDraft(makePart({ crossReferences: [{ brand: "Mann", code: "C123" }] }));
    expect(draft.equivalentPartIds).toEqual(["part-2"]);
    expect(draft.crossReferences).toEqual([{ brand: "Mann", code: "C123" }]);
    expect(draft.newSupplierEntry).toBeNull();
  });
});
