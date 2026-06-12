import { describe, it, expect } from "vitest";
import { generateWaveBars } from "./audioWaveform";

describe("generateWaveBars", () => {
  it("returns the requested number of bars", () => {
    expect(generateWaveBars("abc", 20)).toHaveLength(20);
    expect(generateWaveBars("abc", 0)).toHaveLength(0);
  });

  it("keeps every bar within the 20–100 range", () => {
    for (const h of generateWaveBars("voice-note-xyz", 32)) {
      expect(h).toBeGreaterThanOrEqual(20);
      expect(h).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(generateWaveBars("m1", 16)).toEqual(generateWaveBars("m1", 16));
  });

  it("differs across seeds", () => {
    expect(generateWaveBars("m1", 16)).not.toEqual(generateWaveBars("m2", 16));
  });
});
