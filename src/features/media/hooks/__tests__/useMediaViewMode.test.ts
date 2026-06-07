import { describe, it, expect } from "vitest";
import { normalizeMediaViewMode, MEDIA_VIEW_MODES } from "../useMediaViewMode";

describe("normalizeMediaViewMode", () => {
  it("exposes exactly the three modes in order", () => {
    expect(MEDIA_VIEW_MODES).toEqual(["grade", "cartoes", "tipo"]);
  });
  it("returns the value when it is a valid mode", () => {
    expect(normalizeMediaViewMode("cartoes")).toBe("cartoes");
    expect(normalizeMediaViewMode("tipo")).toBe("tipo");
  });
  it("falls back to 'grade' for null/undefined/unknown", () => {
    expect(normalizeMediaViewMode(null)).toBe("grade");
    expect(normalizeMediaViewMode(undefined)).toBe("grade");
    expect(normalizeMediaViewMode("kanban")).toBe("grade");
    expect(normalizeMediaViewMode("")).toBe("grade");
  });
});
