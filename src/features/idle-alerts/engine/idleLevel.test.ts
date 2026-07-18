import { describe, expect, it } from "vitest";
import { computeIdleLevel, formatElapsed } from "./idleLevel";
import { DEFAULT_IDLE_ALERTS_SETTINGS } from "../config/defaults";

const S = { ...DEFAULT_IDLE_ALERTS_SETTINGS, enabled: true };

describe("computeIdleLevel", () => {
  it("maps business seconds onto the 0-3 ladder", () => {
    expect(computeIdleLevel(0, S)).toBe(0);
    expect(computeIdleLevel(2 * 3600 - 1, S)).toBe(0);
    expect(computeIdleLevel(2 * 3600, S)).toBe(1);
    expect(computeIdleLevel(8 * 3600, S)).toBe(2);
    expect(computeIdleLevel(24 * 3600, S)).toBe(3);
    expect(computeIdleLevel(999 * 3600, S)).toBe(3);
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-07-16T12:00:00-03:00");
  it("formats minutes, hours and days (pt-BR compact)", () => {
    expect(formatElapsed("2026-07-16T11:35:00-03:00", now)).toBe("25min");
    expect(formatElapsed("2026-07-16T09:00:00-03:00", now)).toBe("3h");
    expect(formatElapsed("2026-07-12T10:00:00-03:00", now)).toBe("4d 2h");
  });
});
