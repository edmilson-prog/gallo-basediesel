import { describe, expect, it } from "vitest";
import { formatMinutesLabel, formatWaitLabel, greetingLabel } from "./formatters";

describe("formatMinutesLabel", () => {
  it("formats sub-hour durations as minutes", () => {
    expect(formatMinutesLabel(3 * 60_000)).toBe("3 min");
  });
  it("formats hour+minute durations", () => {
    expect(formatMinutesLabel(72 * 60_000)).toBe("1h 12min");
  });
  it("formats whole-hour durations without a minutes suffix", () => {
    expect(formatMinutesLabel(120 * 60_000)).toBe("2h");
  });
  it("returns an em dash for zero or negative durations", () => {
    expect(formatMinutesLabel(0)).toBe("—");
    expect(formatMinutesLabel(-5)).toBe("—");
  });
});

describe("formatWaitLabel", () => {
  const now = new Date("2026-07-23T18:00:00.000Z");
  it("formats minutes, hours and days", () => {
    expect(formatWaitLabel("2026-07-23T17:35:00.000Z", now)).toBe("25 min");
    expect(formatWaitLabel("2026-07-23T15:00:00.000Z", now)).toBe("3h");
    expect(formatWaitLabel("2026-07-19T16:00:00.000Z", now)).toBe("4d 2h");
  });
});

describe("greetingLabel", () => {
  it("returns the right greeting per hour bucket", () => {
    expect(greetingLabel(8)).toBe("Bom dia");
    expect(greetingLabel(14)).toBe("Boa tarde");
    expect(greetingLabel(21)).toBe("Boa noite");
  });
});
