import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("shows a floor for sub-minute spans", () => {
    expect(formatDuration(30_000)).toBe("< 1min");
    expect(formatDuration(0)).toBe("< 1min");
  });

  it("formats minutes only", () => {
    expect(formatDuration(12 * 60_000)).toBe("12min");
  });

  it("formats hours + minutes, dropping minutes when exact", () => {
    expect(formatDuration(2 * 3_600_000 + 10 * 60_000)).toBe("2h 10min");
    expect(formatDuration(3 * 3_600_000)).toBe("3h");
  });

  it("formats days + hours, dropping hours when exact", () => {
    expect(formatDuration(24 * 3_600_000 + 3 * 3_600_000)).toBe("1d 3h");
    expect(formatDuration(2 * 24 * 3_600_000)).toBe("2d");
  });
});
