import { describe, expect, it } from "vitest";
import { hexToAccentSlot } from "./legacyStageColor";

describe("hexToAccentSlot", () => {
  it("maps the seeded pipeline colours to distinct slots", () => {
    // The five colours seeded in SEED_PIPELINE_STAGES / the frontend fallback.
    const seeded = ["#5b6b7a", "#D2A809", "#337648", "#C79C2C", "#C4151C"];
    const slots = seeded.map(hexToAccentSlot);
    expect(new Set(slots).size).toBeGreaterThanOrEqual(4);
  });

  it("maps a red to the red slot and a green to the green slot", () => {
    expect(hexToAccentSlot("#C4151C")).toBe(1);
    expect(hexToAccentSlot("#337648")).toBe(3);
  });

  it("is case-insensitive and tolerates the leading hash being absent", () => {
    expect(hexToAccentSlot("c4151c")).toBe(hexToAccentSlot("#C4151C"));
  });

  it("falls back to neutral for undefined, empty or malformed input", () => {
    expect(hexToAccentSlot(undefined)).toBe(0);
    expect(hexToAccentSlot("")).toBe(0);
    expect(hexToAccentSlot("not-a-colour")).toBe(0);
    expect(hexToAccentSlot("#12")).toBe(0);
  });
});
