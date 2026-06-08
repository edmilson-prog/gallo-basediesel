import { describe, expect, it } from "vitest";
import type { IMediaAsset } from "@/shared/types";
import { applyMediaFilters, highlightRanges, highlightSegments } from "../mediaFiltering";

function asset(over: Partial<IMediaAsset>): IMediaAsset {
  return {
    id: "m",
    storeId: "00000000-0000-0000-0000-000000000001",
    kind: "image",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    authorType: "customer",
    direction: "in",
    createdAt: "2026-06-01T00:00:00.000Z",
    storageRef: "ref",
    persisted: true,
    sensitivity: "normal",
    ...over,
  };
}

const SET: IMediaAsset[] = [
  asset({ id: "a", kind: "image", classification: "peca", fileName: "pastilha-freio.jpg" }),
  asset({ id: "b", kind: "document", classification: "nota_fiscal", fileName: "nf-1.pdf", ocrText: "NOTA FISCAL 55321" }),
  asset({ id: "c", kind: "audio", classification: "outro", transcription: "preciso de pastilha de freio" }),
];

describe("applyMediaFilters", () => {
  it("returns everything when no filters set", () => {
    expect(applyMediaFilters(SET, {}).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
  it("filters by kind", () => {
    expect(applyMediaFilters(SET, { kind: "audio" }).map((a) => a.id)).toEqual(["c"]);
  });
  it("filters by classification AND kind together (AND semantics)", () => {
    expect(applyMediaFilters(SET, { kind: "document", classification: "nota_fiscal" }).map((a) => a.id)).toEqual([
      "b",
    ]);
    expect(applyMediaFilters(SET, { kind: "image", classification: "nota_fiscal" })).toHaveLength(0);
  });
  it("searches fileName, ocrText and transcription", () => {
    expect(applyMediaFilters(SET, { search: "55321" }).map((a) => a.id)).toEqual(["b"]);
    expect(applyMediaFilters(SET, { search: "freio" }).map((a) => a.id).sort()).toEqual(["a", "c"]);
  });
  it("search is case-insensitive and accent-tolerant on the query trim", () => {
    expect(applyMediaFilters(SET, { search: "  FREIO " }).map((a) => a.id).sort()).toEqual(["a", "c"]);
  });
});

describe("highlightRanges", () => {
  it("returns match ranges for the term within a text", () => {
    expect(highlightRanges("preciso de pastilha de freio", "freio")).toEqual([{ start: 23, end: 28 }]);
  });
  it("returns multiple ranges", () => {
    expect(highlightRanges("freio e mais freio", "freio")).toEqual([
      { start: 0, end: 5 },
      { start: 13, end: 18 },
    ]);
  });
  it("returns empty for no match or empty term", () => {
    expect(highlightRanges("abc", "z")).toEqual([]);
    expect(highlightRanges("abc", "")).toEqual([]);
  });
});

describe("highlightSegments (built on highlightRanges; Plan B maps over this)", () => {
  it("splits the text into segments that cover the whole string, isMatch true only on the term", () => {
    const segs = highlightSegments("preciso de pastilha de freio", "freio");
    // Segments reassemble the original string exactly.
    expect(segs.map((s) => s.text).join("")).toBe("preciso de pastilha de freio");
    // Only the matched term carries isMatch === true.
    expect(segs.filter((s) => s.isMatch)).toEqual([{ text: "freio", isMatch: true }]);
  });
  it("handles multiple occurrences and preserves original casing of each segment", () => {
    const segs = highlightSegments("Freio e mais freio", "freio");
    expect(segs.map((s) => s.text).join("")).toBe("Freio e mais freio");
    expect(segs.filter((s) => s.isMatch).map((s) => s.text)).toEqual(["Freio", "freio"]);
  });
  it("returns the whole text as a single non-match segment when there is no match or empty term", () => {
    expect(highlightSegments("abc", "z")).toEqual([{ text: "abc", isMatch: false }]);
    expect(highlightSegments("abc", "")).toEqual([{ text: "abc", isMatch: false }]);
  });
});
