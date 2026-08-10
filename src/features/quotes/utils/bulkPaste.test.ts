// src/features/quotes/utils/bulkPaste.test.ts
import { describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import { parseBulkPasteLines, resolveBulkPaste } from "./bulkPaste";

function part(id: string, sku: string, oemCodes: string[] = []): IPart {
  return { id, sku, oemCodes } as unknown as IPart;
}

const CATALOG = [
  part("p1", "GP-0445120212", ["0445120212"]),
  part("p2", "GP-FS20020", ["FS20020", "WK 940/46"]),
  part("p3", "008971", []),
];

describe("parseBulkPasteLines", () => {
  it("parses code and quantity separated by ; , or tab", () => {
    expect(parseBulkPasteLines("A; 2\nB,3\nC\t4")).toEqual([
      { code: "A", quantity: 2 },
      { code: "B", quantity: 3 },
      { code: "C", quantity: 4 },
    ]);
  });

  it("defaults the quantity to 1 when absent, zero, negative or unparseable", () => {
    expect(parseBulkPasteLines("A\nB;\nC; x\nD; 0\nE; -3")).toEqual([
      { code: "A", quantity: 1 },
      { code: "B", quantity: 1 },
      { code: "C", quantity: 1 },
      { code: "D", quantity: 1 },
      { code: "E", quantity: 1 },
    ]);
  });

  it("skips blank lines and lines without a code", () => {
    expect(parseBulkPasteLines("\n  \nA; 1\n; 5\n")).toEqual([{ code: "A", quantity: 1 }]);
  });
});

describe("resolveBulkPaste", () => {
  it("matches by SKU case-insensitively", () => {
    const { matched, unmatched } = resolveBulkPaste([{ code: "gp-fs20020", quantity: 2 }], CATALOG);
    expect(unmatched).toEqual([]);
    expect(matched).toEqual([{ part: CATALOG[1], quantity: 2 }]);
  });

  it("falls back to OEM codes when the SKU does not match", () => {
    const { matched } = resolveBulkPaste([{ code: "0445120212", quantity: 1 }], CATALOG);
    expect(matched).toEqual([{ part: CATALOG[0], quantity: 1 }]);
  });

  it("sums quantities when the same part appears more than once", () => {
    const { matched } = resolveBulkPaste(
      [
        { code: "GP-FS20020", quantity: 2 },
        { code: "FS20020", quantity: 3 },
      ],
      CATALOG,
    );
    expect(matched).toEqual([{ part: CATALOG[1], quantity: 5 }]);
  });

  it("reports unknown codes once, preserving the typed form", () => {
    const { matched, unmatched } = resolveBulkPaste(
      [
        { code: "XPTO", quantity: 1 },
        { code: "xpto", quantity: 1 },
        { code: "008971", quantity: 1 },
      ],
      CATALOG,
    );
    expect(matched).toEqual([{ part: CATALOG[2], quantity: 1 }]);
    expect(unmatched).toEqual(["XPTO"]);
  });

  it("tolerates parts without OEM codes", () => {
    const { matched, unmatched } = resolveBulkPaste(
      [{ code: "008971", quantity: 4 }],
      [part("p9", "008971")],
    );
    expect(unmatched).toEqual([]);
    expect(matched[0]?.quantity).toBe(4);
  });
});
