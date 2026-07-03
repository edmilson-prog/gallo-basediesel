import { describe, it, expect } from "vitest";
import { parsePartLookupLayout, DEFAULT_PART_LOOKUP_LAYOUT } from "./partLookupLayout";

describe("parsePartLookupLayout", () => {
  it("returns the value when valid", () => {
    expect(parsePartLookupLayout("dense")).toBe("dense");
    expect(parsePartLookupLayout("tabs")).toBe("tabs");
  });
  it("falls back to default for null/invalid", () => {
    expect(parsePartLookupLayout(null)).toBe(DEFAULT_PART_LOOKUP_LAYOUT);
    expect(parsePartLookupLayout("banana")).toBe(DEFAULT_PART_LOOKUP_LAYOUT);
  });
  it("default is headline", () => {
    expect(DEFAULT_PART_LOOKUP_LAYOUT).toBe("headline");
  });
});
