import { describe, expect, it } from "vitest";
import { getAccentClasses, FUNNEL_ACCENT_SLOTS } from "./accentClasses";

describe("getAccentClasses", () => {
  it("maps every declared slot", () => {
    for (const slot of FUNNEL_ACCENT_SLOTS) {
      const classes = getAccentClasses(slot);
      expect(classes.dot).toContain(`funnel-${slot}`);
      expect(classes.border).toContain(`funnel-${slot}`);
    }
  });

  it("never builds a class by template string", () => {
    // Tailwind v4 does not generate classes assembled at runtime; the map must
    // hold complete literals.
    expect(getAccentClasses(3).dot).toBe("bg-funnel-3");
  });

  // Regression: the 2026-07-18 incident, where origin='import' had no META
  // entry and took /app/leads down with `undefined.tone`. Accent comes from the
  // database and can hold a value this build does not know about.
  it("falls back to the neutral slot for an unknown accent", () => {
    expect(getAccentClasses(99)).toBe(getAccentClasses(0));
    expect(getAccentClasses(-1)).toBe(getAccentClasses(0));
    expect(getAccentClasses(Number.NaN)).toBe(getAccentClasses(0));
  });

  it("uses the muted token for the neutral slot chip", () => {
    expect(getAccentClasses(0).chip).toBe("bg-muted");
  });
});
