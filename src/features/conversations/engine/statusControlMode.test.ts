import { describe, it, expect } from "vitest";
import {
  STATUS_CONTROL_MODES,
  DEFAULT_STATUS_CONTROL_MODE,
  normalizeStatusControlMode,
} from "./statusControlMode";

describe("statusControlMode", () => {
  it("lists exactly the three supported modes", () => {
    expect(STATUS_CONTROL_MODES).toEqual(["pill", "menu", "segmented"]);
  });

  it("defaults to pill", () => {
    expect(DEFAULT_STATUS_CONTROL_MODE).toBe("pill");
  });

  it("passes through valid modes", () => {
    expect(normalizeStatusControlMode("menu")).toBe("menu");
    expect(normalizeStatusControlMode("segmented")).toBe("segmented");
  });

  it("falls back to the default for unknown / null / undefined values", () => {
    expect(normalizeStatusControlMode("bogus")).toBe("pill");
    expect(normalizeStatusControlMode(null)).toBe("pill");
    expect(normalizeStatusControlMode(undefined)).toBe("pill");
  });
});
