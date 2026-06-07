import { describe, it, expect } from "vitest";
import { normalizeAssetPickerMode, ASSET_PICKER_MODES } from "../useAssetPickerMode";

describe("normalizeAssetPickerMode", () => {
  it("returns the value when it is a valid mode", () => {
    expect(normalizeAssetPickerMode("grid")).toBe("grid");
    expect(normalizeAssetPickerMode("sheet")).toBe("sheet");
    expect(normalizeAssetPickerMode("palette")).toBe("palette");
  });

  it("falls back to palette for null / undefined / unknown", () => {
    expect(normalizeAssetPickerMode(null)).toBe("palette");
    expect(normalizeAssetPickerMode(undefined)).toBe("palette");
    expect(normalizeAssetPickerMode("bogus")).toBe("palette");
    expect(normalizeAssetPickerMode("")).toBe("palette");
  });

  it("exposes exactly the three coexisting modes", () => {
    expect(ASSET_PICKER_MODES).toEqual(["palette", "grid", "sheet"]);
  });
});
