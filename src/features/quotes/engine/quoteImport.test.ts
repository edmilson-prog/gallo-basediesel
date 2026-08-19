// src/features/quotes/engine/quoteImport.test.ts
import { describe, expect, it } from "vitest";
import {
  applyLlmSuggestions,
  buildImportSelection,
  interpretImportText,
  shortlistForLine,
  type IImportCatalogPart,
  type IImportLine,
} from "./quoteImport";

const CATALOG: IImportCatalogPart[] = [
  {
    id: "p1",
    sku: "GP-0445120212",
    oemCodes: ["0445120212"],
    name: "Bico Injetor Common Rail",
    brand: "Bosch",
    unitPrice: 1289.9,
  },
  {
    id: "p2",
    sku: "RM-0445120212",
    oemCodes: ["0445120212"],
    name: "Bico Injetor Common Rail (remanufaturado)",
    brand: "Reman Diesel",
    unitPrice: 979,
  },
  {
    id: "p4",
    sku: "GP-F00RJ01727",
    oemCodes: ["F00RJ01727"],
    name: "Kit Reparo Bico Injetor",
    brand: "Bosch",
    unitPrice: 274.5,
  },
  {
    id: "p9",
    sku: "GP-OL15W40",
    oemCodes: [],
    name: "Óleo 15W40 CI-4 Diesel (litro)",
    brand: "Petronas",
    unitPrice: 38.9,
  },
];

const find = (lines: IImportLine[], fragment: string) =>
  lines.find((l) => l.raw.toLowerCase().includes(fragment.toLowerCase()));

describe("interpretImportText", () => {
  it("drops greetings and headers, keeping only item lines", () => {
    const lines = interpretImportText(
      "Bom dia! Segue o pedido do Atego:\n1 kit reparo F00RJ01727",
      CATALOG,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.raw).toContain("kit reparo");
  });

  it("matches an exact SKU or OEM code with full confidence", () => {
    const lines = interpretImportText("2 bicos injetores 0445120212\n1 GP-F00RJ01727", CATALOG);
    const oem = find(lines, "0445120212");
    expect(oem?.confidence).toBe("exact");
    expect(oem?.quantity).toBe(2);
    const sku = find(lines, "F00RJ01727");
    expect(sku?.partId).toBe("p4");
    expect(sku?.confidence).toBe("exact");
  });

  it("reads the leading quantity, defaulting to one", () => {
    const lines = interpretImportText("12 litros de óleo 15W40\nkit reparo", CATALOG);
    expect(find(lines, "óleo")?.quantity).toBe(12);
    expect(find(lines, "kit reparo")?.quantity).toBe(1);
  });

  it("marks a name that fits several parts as ambiguous, with candidates", () => {
    const lines = interpretImportText("2 bico injetor common rail", CATALOG);
    const line = lines[0];
    expect(line?.confidence).toBe("ambiguous");
    expect(line?.candidateIds).toContain("p1");
    expect(line?.candidateIds).toContain("p2");
    expect(line?.partId).toBeUndefined();
  });

  it("leaves a line nothing matches as unmatched", () => {
    const lines = interpretImportText("1 bomba d'água do Scania", CATALOG);
    expect(lines[0]?.confidence).toBe("unmatched");
    expect(lines[0]?.partId).toBeUndefined();
  });

  it("keeps the customer's own wording as `raw`", () => {
    const lines = interpretImportText("  2 bicos injetores 0445120212  ", CATALOG);
    expect(lines[0]?.raw).toBe("2 bicos injetores 0445120212");
  });
});

describe("applyLlmSuggestions", () => {
  const pending = () => interpretImportText("1 bomba d'água do Scania", CATALOG);

  it("fills an unmatched line when the model names a real part", () => {
    const lines = applyLlmSuggestions(pending(), [{ index: 0, partId: "p4" }], CATALOG);
    expect(lines[0]?.partId).toBe("p4");
    expect(lines[0]?.confidence).toBe("probable");
  });

  it("ignores a part id that is not in the catalog — the model may invent one", () => {
    const lines = applyLlmSuggestions(pending(), [{ index: 0, partId: "does-not-exist" }], CATALOG);
    expect(lines[0]?.partId).toBeUndefined();
    expect(lines[0]?.confidence).toBe("unmatched");
  });

  it("never overrides a line already matched by exact code", () => {
    const exact = interpretImportText("1 GP-F00RJ01727", CATALOG);
    const lines = applyLlmSuggestions(exact, [{ index: 0, partId: "p9" }], CATALOG);
    expect(lines[0]?.partId).toBe("p4");
    expect(lines[0]?.confidence).toBe("exact");
  });

  it("takes candidates from the model for an ambiguous line", () => {
    const lines = applyLlmSuggestions(
      pending(),
      [{ index: 0, candidateIds: ["p1", "p2"] }],
      CATALOG,
    );
    expect(lines[0]?.confidence).toBe("ambiguous");
    expect(lines[0]?.candidateIds).toEqual(["p1", "p2"]);
  });
});

describe("buildImportSelection", () => {
  it("splits catalog rows from off-catalog ones and prices from the catalog", () => {
    const lines: IImportLine[] = [
      {
        key: "a",
        raw: "2 bicos",
        quantity: 2,
        partId: "p1",
        candidateIds: [],
        confidence: "exact",
      },
      { key: "b", raw: "1 bomba", quantity: 1, candidateIds: [], confidence: "unmatched" },
    ];
    const selection = buildImportSelection(lines, { a: true, b: true }, { b: "250,00" }, CATALOG);
    expect(selection.catalog).toEqual([{ partId: "p1", quantity: 2 }]);
    expect(selection.free).toEqual([{ name: "bomba", quantity: 1, unitPrice: 250 }]);
  });

  it("leaves out unchecked lines and unpriced off-catalog ones", () => {
    const lines: IImportLine[] = [
      {
        key: "a",
        raw: "2 bicos",
        quantity: 2,
        partId: "p1",
        candidateIds: [],
        confidence: "exact",
      },
      { key: "b", raw: "1 bomba", quantity: 1, candidateIds: [], confidence: "unmatched" },
    ];
    const selection = buildImportSelection(lines, { a: false, b: true }, {}, CATALOG);
    expect(selection.catalog).toHaveLength(0);
    expect(selection.free).toHaveLength(0);
  });
});

describe("shortlistForLine", () => {
  it("ranks the parts that share words with the line, capped", () => {
    const shortlist = shortlistForLine("bico injetor common rail", CATALOG, 2);
    expect(shortlist).toHaveLength(2);
    expect(shortlist.map((p) => p.id)).toContain("p1");
  });

  it("falls back to the head of the catalog when nothing scores", () => {
    const shortlist = shortlistForLine("xyzabc", CATALOG, 3);
    expect(shortlist).toHaveLength(3);
  });
});

describe("the structured paste the old Rápido mode accepted", () => {
  it("still reads `SKU; quantidade`, one per line, as exact matches", () => {
    const lines = interpretImportText("GP-0445120212; 2\nGP-F00RJ01727; 4", CATALOG);
    expect(lines.map((l) => [l.partId, l.quantity, l.confidence])).toEqual([
      ["p1", 2, "exact"],
      ["p4", 4, "exact"],
    ]);
  });

  it("reads a bare OEM code with no quantity as one unit", () => {
    const lines = interpretImportText("0445120212", CATALOG);
    expect(lines[0]?.confidence).toBe("exact");
    expect(lines[0]?.quantity).toBe(1);
  });
});
