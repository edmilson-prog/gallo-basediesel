import { describe, expect, it } from "vitest";
import {
  PLAYBACK_RATES,
  formatPlaybackRate,
  nextPlaybackRate,
  sanitizePlaybackRate,
} from "./audioPlayback";

describe("nextPlaybackRate", () => {
  it("cycles 1 → 1.5 → 2 → 1", () => {
    expect(nextPlaybackRate(1)).toBe(1.5);
    expect(nextPlaybackRate(1.5)).toBe(2);
    expect(nextPlaybackRate(2)).toBe(1);
  });

  it("falls back to the first rate after the current one for an unknown value", () => {
    expect(nextPlaybackRate(3)).toBe(PLAYBACK_RATES[0]);
    expect(nextPlaybackRate(Number.NaN)).toBe(PLAYBACK_RATES[0]);
  });
});

describe("formatPlaybackRate", () => {
  it("renders pt-BR labels with a comma decimal and the × sign", () => {
    expect(formatPlaybackRate(1)).toBe("1×");
    expect(formatPlaybackRate(1.5)).toBe("1,5×");
    expect(formatPlaybackRate(2)).toBe("2×");
  });
});

describe("sanitizePlaybackRate", () => {
  it("accepts only known rates", () => {
    expect(sanitizePlaybackRate("1.5")).toBe(1.5);
    expect(sanitizePlaybackRate("2")).toBe(2);
    expect(sanitizePlaybackRate(1)).toBe(1);
  });

  it("defaults to 1 for invalid / missing input", () => {
    expect(sanitizePlaybackRate(null)).toBe(1);
    expect(sanitizePlaybackRate(undefined)).toBe(1);
    expect(sanitizePlaybackRate("fast")).toBe(1);
    expect(sanitizePlaybackRate("3")).toBe(1);
    expect(sanitizePlaybackRate("")).toBe(1);
  });
});
