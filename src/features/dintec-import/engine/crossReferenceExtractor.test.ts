import { describe, expect, it } from "vitest";
import { extractCrossReferences } from "./crossReferenceExtractor";

describe("extractCrossReferences", () => {
  const brands = ["Mann", "Hengst", "Mahle"];

  it("reads one column per brand, skipping empty/dash cells", () => {
    const row = ["19.008.00", "Chave", "HU612/1X", "-", "OX382D"];
    expect(extractCrossReferences(row, brands, 2)).toEqual([
      { brand: "Mann", code: "HU612/1X" },
      { brand: "Mahle", code: "OX382D" },
    ]);
  });

  it("returns an empty array when every cross-reference cell is empty", () => {
    const row = ["19.008.00", "Chave", "", "-", ""];
    expect(extractCrossReferences(row, brands, 2)).toEqual([]);
  });

  it("returns an empty array when the row is shorter than the brand range", () => {
    const row = ["19.008.00", "Chave"];
    expect(extractCrossReferences(row, brands, 2)).toEqual([]);
  });
});
