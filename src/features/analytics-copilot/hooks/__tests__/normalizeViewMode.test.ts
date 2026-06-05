import { describe, expect, it } from "vitest";
import { normalizeViewMode, COPILOT_VIEW_MODES } from "../useCopilotViewMode";

describe("normalizeViewMode", () => {
  it("aceita os modos válidos", () => {
    for (const m of COPILOT_VIEW_MODES) expect(normalizeViewMode(m)).toBe(m);
  });
  it("default 'foco' para entradas inválidas/nulas", () => {
    expect(normalizeViewMode(null)).toBe("foco");
    expect(normalizeViewMode("xyz")).toBe("foco");
    expect(normalizeViewMode(undefined)).toBe("foco");
  });
});
