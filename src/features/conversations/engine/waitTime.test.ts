import { describe, it, expect } from "vitest";
import {
  formatWaitTime,
  waitSeverity,
  WAIT_WARNING_MS,
  WAIT_CRITICAL_MS,
} from "./waitTime";

const MIN = 60_000;

describe("formatWaitTime", () => {
  it("shows <1 min under a minute", () => {
    expect(formatWaitTime(0)).toBe("<1 min");
    expect(formatWaitTime(59_000)).toBe("<1 min");
  });

  it("shows whole minutes under an hour", () => {
    expect(formatWaitTime(1 * MIN)).toBe("1 min");
    expect(formatWaitTime(45 * MIN)).toBe("45 min");
    expect(formatWaitTime(59 * MIN)).toBe("59 min");
  });

  it("shows hours with zero-padded minutes under a day", () => {
    expect(formatWaitTime(60 * MIN)).toBe("1h 00");
    expect(formatWaitTime((2 * 60 + 5) * MIN)).toBe("2h 05");
    expect(formatWaitTime((23 * 60 + 59) * MIN)).toBe("23h 59");
  });

  it("shows whole days at or beyond 24h", () => {
    expect(formatWaitTime(24 * 60 * MIN)).toBe("1 d");
    expect(formatWaitTime(50 * 60 * MIN)).toBe("2 d");
  });
});

describe("waitSeverity", () => {
  it("is neutral below the warning threshold", () => {
    expect(waitSeverity(0)).toBe("neutral");
    expect(waitSeverity(WAIT_WARNING_MS - 1)).toBe("neutral");
  });

  it("is warning between the two thresholds (inclusive of warning)", () => {
    expect(waitSeverity(WAIT_WARNING_MS)).toBe("warning");
    expect(waitSeverity(WAIT_CRITICAL_MS - 1)).toBe("warning");
  });

  it("is critical at or above the critical threshold", () => {
    expect(waitSeverity(WAIT_CRITICAL_MS)).toBe("critical");
    expect(waitSeverity(10 * WAIT_CRITICAL_MS)).toBe("critical");
  });
});
