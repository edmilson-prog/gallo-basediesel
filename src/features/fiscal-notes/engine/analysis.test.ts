import { describe, expect, it } from "vitest";
import { analyzeNote, type IAnalysisInput, type IAnalysisItem } from "./analysis";

// Item declarado à parte e tipado: espalhar `BASE.items[0]` não passa em
// `noUncheckedIndexedAccess`, porque o acesso indexado é `T | undefined`.
const ITEM: IAnalysisItem = {
  itemId: "i1",
  partId: "p-bico",
  partName: "Bico injetor Bosch CR 0445120212",
  description: "BICO INJETOR CR 0445120212",
  ncm: "84099190",
  catalogNcm: "84099190",
  unitCost: 389,
  stockUnit: "UN",
  monthlySales: 4,
  currentStock: 6,
};

const BASE: IAnalysisInput = {
  noteId: "n1",
  accessKey: "35260804887213000190550010000301291000301298",
  supplierName: "Dieseltec",
  supplierIsNew: false,
  knownAccessKeys: [],
  items: [ITEM],
  purchaseHistory: {
    "p-bico": [
      { supplierName: "Bosch", unitCost: 332, purchasedAt: "2026-02-10", label: "fev" },
      { supplierName: "Bosch", unitCost: 346, purchasedAt: "2026-07-14", label: "jul" },
    ],
  },
};

describe("analyzeNote", () => {
  it("flags a unit cost above the last purchase", () => {
    const card = analyzeNote(BASE).find((c) => c.kind === "price");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("danger");
    // 389 sobre 346 = +12,4%
    expect(card!.title).toMatch(/12,4%/);
    expect(card!.series?.map((p) => p.value)).toEqual([332, 346, 389]);
  });

  it("does not flag a price within the tolerance band", () => {
    const input: IAnalysisInput = {
      ...BASE,
      items: [{ ...ITEM, unitCost: 350 }],
    };
    expect(analyzeNote(input).some((c) => c.kind === "price")).toBe(false);
  });

  it("flags an NCM that differs from the catalog", () => {
    const input: IAnalysisInput = {
      ...BASE,
      items: [{ ...ITEM, ncm: "84212300", catalogNcm: "84212990" }],
    };
    const card = analyzeNote(input).find((c) => c.kind === "fiscal");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("warning");
    expect(card!.description).toContain("84212300");
    expect(card!.description).toContain("84212990");
  });

  it("flags a supplier created from the XML so someone completes it", () => {
    const card = analyzeNote({ ...BASE, supplierIsNew: true }).find((c) => c.kind === "registry");
    expect(card).toBeDefined();
    expect(card!.title).toContain("Dieseltec");
  });

  it("flags a duplicated access key", () => {
    const card = analyzeNote({ ...BASE, knownAccessKeys: [BASE.accessKey] }).find(
      (c) => c.kind === "duplicate",
    );
    expect(card).toBeDefined();
    expect(card!.severity).toBe("danger");
  });

  it("reports the duplicate check as clean when the key is new", () => {
    const card = analyzeNote(BASE).find((c) => c.kind === "duplicate");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("success");
  });

  it("suggests fractioning stagnant packaging that sells in fractions", () => {
    const input: IAnalysisInput = {
      ...BASE,
      items: [
        {
          ...ITEM,
          partId: "p-graxa",
          partName: "Graxa EP2 balde 20 kg",
          stockUnit: "BD",
          monthlySales: 0,
          currentStock: 3,
          fractionCandidate: { partName: "Graxa EP2 pote 1 kg", monthlySales: 14 },
        },
      ],
    };
    const card = analyzeNote(input).find((c) => c.kind === "fractioning");
    expect(card).toBeDefined();
    expect(card!.description).toContain("14");
  });

  it("returns only the duplicate-check card for a clean note with no history", () => {
    const clean: IAnalysisInput = {
      ...BASE,
      items: [{ ...ITEM, unitCost: 346 }],
      purchaseHistory: {},
    };
    expect(analyzeNote(clean).map((c) => c.kind)).toEqual(["duplicate"]);
  });
});
