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

import {
  buildPartPatch,
  isSupplierEntryFillable,
  validatePartDraft,
} from "./draft";

describe("validatePartDraft", () => {
  it("requires name, OEM primary, brand and category", () => {
    const draft = toPartDraft(makePart({ name: "", oemCodes: [], brand: "", category: undefined }));
    const errors = validatePartDraft(draft);
    expect(errors.name).toBeDefined();
    expect(errors.oemPrimary).toBeDefined();
    expect(errors.brand).toBeDefined();
    expect(errors.category).toBeDefined();
  });

  it("requires a positive Padrão price", () => {
    const draft = toPartDraft(makePart({ unitCost: 0 }));
    // unitCost=0 makes resolvePriceTables return [] (no cost to price from)
    const errors = validatePartDraft(draft);
    expect(errors.standardPrice).toBeDefined();
  });

  it("passes with a complete, valid draft", () => {
    const draft = toPartDraft(makePart({ category: "filtro" }));
    expect(validatePartDraft(draft)).toEqual({});
  });
});

describe("isSupplierEntryFillable", () => {
  it("is false for null or partially filled entries", () => {
    expect(isSupplierEntryFillable(null)).toBe(false);
    expect(
      isSupplierEntryFillable({
        name: "",
        supplierCode: "",
        invoiceNumber: "",
        invoiceDate: "",
        cost: 10,
        quantity: 5,
      }),
    ).toBe(false);
    expect(
      isSupplierEntryFillable({
        name: "Scherer",
        supplierCode: "",
        invoiceNumber: "",
        invoiceDate: "",
        cost: undefined,
        quantity: 5,
      }),
    ).toBe(false);
  });

  it("is true once name, cost and quantity are present", () => {
    expect(
      isSupplierEntryFillable({
        name: "Scherer",
        supplierCode: "",
        invoiceNumber: "",
        invoiceDate: "",
        cost: 92.5,
        quantity: 10,
      }),
    ).toBe(true);
  });
});

describe("buildPartPatch", () => {
  it("mirrors the Padrão channel into unitPrice and marginPercent", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    draft.priceTables = draft.priceTables.map((t) =>
      t.id === "padrao" ? { ...t, price: 200, markupPercent: 1.16 } : t,
    );
    const patch = buildPartPatch(part, draft, false);
    expect(patch.unitPrice).toBe(200);
    expect(patch.marginPercent).toBeCloseTo(1.16, 4);
    expect(patch.priceTables).toEqual(draft.priceTables);
  });

  it("omits price/cost fields entirely when priceLocked", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    const patch = buildPartPatch(part, draft, true);
    expect(patch.unitCost).toBeUndefined();
    expect(patch.unitPrice).toBeUndefined();
    expect(patch.priceTables).toBeUndefined();
    expect(patch.marginPercent).toBeUndefined();
  });

  it("parses OEM codes and trims optional text fields to undefined when empty", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    draft.oemAlternatives = " ALT-9 ";
    draft.description = "   ";
    draft.gtin = "  7890  ";
    const patch = buildPartPatch(part, draft, false);
    expect(patch.oemCodes).toEqual(["VOL-123456", "ALT-9"]);
    expect(patch.description).toBeUndefined();
    expect(patch.gtin).toBe("7890");
  });

  it("appends a new supplier entry only when fillable, keeping past entries untouched", () => {
    const part = makePart({
      category: "filtro",
      suppliers: [{ id: "sup-1", name: "Old Co", cost: 80, quantity: 3 }],
    });
    const draft = toPartDraft(part);
    draft.newSupplierEntry = {
      name: "New Co",
      supplierCode: "",
      invoiceNumber: "NF-1",
      invoiceDate: "2026-07-18",
      cost: 95,
      quantity: 4,
    };
    const patch = buildPartPatch(part, draft, false);
    expect(patch.suppliers).toHaveLength(2);
    expect(patch.suppliers?.[0]).toEqual(part.suppliers![0]);
    expect(patch.suppliers?.[1]).toMatchObject({ name: "New Co", cost: 95, quantity: 4 });
  });

  it("does not append when the new supplier entry is null", () => {
    const part = makePart({
      category: "filtro",
      suppliers: [{ id: "sup-1", name: "Old Co", cost: 80, quantity: 3 }],
    });
    const draft = toPartDraft(part);
    const patch = buildPartPatch(part, draft, false);
    expect(patch.suppliers).toEqual(part.suppliers);
  });

  it("drops cross-references with an empty brand or code", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    draft.crossReferences = [
      { brand: "Mann", code: "C123" },
      { brand: "", code: "X" },
      { brand: "Fleetguard", code: "" },
    ];
    const patch = buildPartPatch(part, draft, false);
    expect(patch.crossReferences).toEqual([{ brand: "Mann", code: "C123" }]);
  });
});
