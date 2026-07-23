import { describe, expect, it } from "vitest";
import {
  DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS,
  echoContinuityCutoffIso,
  resolveEchoContinuityWindowHours,
} from "./echoContinuity";

describe("resolveEchoContinuityWindowHours", () => {
  it("defaults to 24h when the settings blob is absent or has no echoContinuity", () => {
    expect(resolveEchoContinuityWindowHours(undefined)).toBe(DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS);
    expect(resolveEchoContinuityWindowHours(null)).toBe(DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS);
    expect(resolveEchoContinuityWindowHours({})).toBe(DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS);
    expect(resolveEchoContinuityWindowHours({ echoContinuity: {} })).toBe(
      DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS,
    );
  });

  it("defaults on malformed values instead of trusting them", () => {
    expect(resolveEchoContinuityWindowHours({ echoContinuity: { windowHours: "48" } })).toBe(24);
    expect(resolveEchoContinuityWindowHours({ echoContinuity: { windowHours: NaN } })).toBe(24);
    expect(resolveEchoContinuityWindowHours({ echoContinuity: { windowHours: Infinity } })).toBe(24);
  });

  it("honors an explicit value, clamping negatives to 0 (disabled)", () => {
    expect(resolveEchoContinuityWindowHours({ echoContinuity: { windowHours: 48 } })).toBe(48);
    expect(resolveEchoContinuityWindowHours({ echoContinuity: { windowHours: 0 } })).toBe(0);
    expect(resolveEchoContinuityWindowHours({ echoContinuity: { windowHours: -5 } })).toBe(0);
  });
});

describe("echoContinuityCutoffIso", () => {
  const now = Date.parse("2026-07-23T12:00:00.000Z");

  it("returns null when the window is disabled", () => {
    expect(echoContinuityCutoffIso(now, 0)).toBeNull();
    expect(echoContinuityCutoffIso(now, -1)).toBeNull();
  });

  it("computes the cutoff windowHours before now", () => {
    expect(echoContinuityCutoffIso(now, 24)).toBe("2026-07-22T12:00:00.000Z");
    expect(echoContinuityCutoffIso(now, 1)).toBe("2026-07-23T11:00:00.000Z");
  });
});
