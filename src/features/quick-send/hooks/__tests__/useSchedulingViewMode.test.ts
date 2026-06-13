import { describe, expect, it } from "vitest";
import {
  SCHEDULING_VIEW_MODES,
  normalizeSchedulingViewMode,
} from "../useSchedulingViewMode";

describe("normalizeSchedulingViewMode", () => {
  it("returns the value when it is a known mode", () => {
    for (const m of SCHEDULING_VIEW_MODES) {
      expect(normalizeSchedulingViewMode(m)).toBe(m);
    }
  });

  it("falls back to 'modal' for unknown/empty input", () => {
    expect(normalizeSchedulingViewMode(null)).toBe("modal");
    expect(normalizeSchedulingViewMode(undefined)).toBe("modal");
    expect(normalizeSchedulingViewMode("bogus")).toBe("modal");
  });

  it("exposes the four modes with modal first (default)", () => {
    expect(SCHEDULING_VIEW_MODES).toEqual(["modal", "drawer", "inline", "timeline"]);
  });
});
